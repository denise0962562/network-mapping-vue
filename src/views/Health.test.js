import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { computed, ref } from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'

const { descriptor } = parse(readFileSync(new URL('./Health.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'health-retry-test' })
// Run the page's actual setup logic with HTTP and lifecycle hooks supplied by the test.
const source = compiled.scriptSetupAst.filter((node) => node.type === 'ImportDeclaration')
  .reverse().reduce((code, node) => code.slice(0, node.start) + code.slice(node.end), descriptor.scriptSetup.content)

function createPage(get) {
  let dispose
  const page = vm.runInNewContext(`${source}\n;({ loadItems, retryLoad, filters, appliedFilters, page, items, loadFailed, failedQuery, loading })`, {
    computed, ref, useId: () => 'health-test-field', http: { get }, AbortController, crypto: globalThis.crypto,
    onMounted: () => {}, onBeforeUnmount: (callback) => { dispose = callback },
  })
  return { ...page, dispose: () => dispose() }
}

const response = (id) => ({ data: { success: true, items: [{ id }], pagination: { total: 60 } } })
const defaults = { window: '24h', alert_type: '', severity: '' }

test('retry preserves the failed page while retaining the last successful records until success', async () => {
  const requests = []
  let fail = false
  const page = createPage(async (_, { params }) => {
    requests.push(params)
    if (fail) throw new Error('offline')
    return response(params.page)
  })
  await page.loadItems()
  const previousItems = page.items.value
  fail = true
  await page.loadItems(2)
  assert.equal(page.page.value, 1)
  assert.equal(page.items.value, previousItems)
  await page.retryLoad()
  assert.equal(requests.at(-1).page, 2)
  assert.equal(page.loadFailed.value, true)
  fail = false
  await page.retryLoad()
  assert.equal(requests.at(-1).page, 2)
  assert.equal(page.page.value, 2)
  assert.equal(page.items.value[0].id, 2)
  assert.equal(page.failedQuery.value, null)
  assert.equal(page.loadFailed.value, false)
})

test('retry uses an independent snapshot of the failed filters despite later draft edits', async () => {
  const requests = []
  let fail = false
  const page = createPage(async (_, { params }) => {
    requests.push(params)
    if (fail) throw new Error('offline')
    return response(1)
  })
  await page.loadItems(2, defaults)
  fail = true
  page.filters.value = { window: '7d', alert_type: 'slow_sql', severity: 'critical' }
  await page.loadItems(1, page.filters.value)
  assert.equal(page.page.value, 2)
  assert.equal(page.appliedFilters.value.window, '24h')
  page.filters.value.window = '1h'
  page.filters.value.alert_type = 'server_error'
  fail = false
  await page.retryLoad()
  const request = requests.at(-1)
  assert.equal(request.page, 1)
  assert.equal(request.alert_type, 'slow_sql')
  assert.equal(request.severity, 'critical')
  assert.equal(Date.parse(request.end) - Date.parse(request.start), 7 * 86400_000)
  assert.equal(page.appliedFilters.value.window, '7d')
  assert.equal(page.appliedFilters.value.alert_type, 'slow_sql')
})

test('initial-load retry retains requested filters and a newer success clears the failed query', async () => {
  let fail = true
  const requests = []
  const page = createPage(async (_, { params }) => {
    requests.push(params)
    if (fail) throw new Error('offline')
    return response(1)
  })
  await page.loadItems(1, { ...defaults, alert_type: 'slow_sql' })
  fail = false
  await page.retryLoad()
  assert.equal(requests.at(-1).alert_type, 'slow_sql')
  fail = true
  await page.loadItems(2)
  fail = false
  await page.loadItems(1, { ...defaults, severity: 'warning' })
  assert.equal(page.failedQuery.value, null)
  await page.retryLoad()
  assert.equal(requests.at(-1).page, 1)
  assert.equal(requests.at(-1).severity, 'warning')
})

test('superseded failures do not replace the current retry target', async () => {
  let rejectOld
  const page = createPage((_, { params }) => {
    if (params.alert_type === 'slow_sql') return new Promise((_, reject) => { rejectOld = reject })
    return Promise.reject(new Error('current failure'))
  })
  const oldRequest = page.loadItems(2, { ...defaults, alert_type: 'slow_sql' })
  await page.loadItems(1, { ...defaults, alert_type: 'server_error' })
  rejectOld(new Error('late failure'))
  await oldRequest
  assert.equal(page.failedQuery.value.page, 1)
  assert.equal(page.failedQuery.value.filters.alert_type, 'server_error')
  page.dispose()
  assert.equal(page.loading.value, false)
})
