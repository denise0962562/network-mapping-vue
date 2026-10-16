import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { computed, ref } from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { channelForm } from '../utils/notifications.js'

const { descriptor } = parse(readFileSync(new URL('./Notifications.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'notification-lifecycle-test' })
const source = compiled.scriptSetupAst.filter((node) => node.type === 'ImportDeclaration')
  .reverse().reduce((code, node) => code.slice(0, node.start) + code.slice(node.end), descriptor.scriptSetup.content)

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
function createPage(get) {
  let mount, dispose
  const timers = new Map()
  let nextTimer = 0
  const page = vm.runInNewContext(`${source}\n;({ loadChannels, loadHistory, channels, deliveries, loadFailed, historyFailed })`, {
    computed, ref, channelForm, AbortController, crypto: globalThis.crypto,
    http: { get }, useUnsavedChanges: () => {},
    onMounted: (callback) => { mount = callback },
    onBeforeUnmount: (callback) => { dispose = callback },
    document: { hidden: false },
    window: {
      setInterval: (callback) => { const id = ++nextTimer; timers.set(id, callback); return id },
      clearInterval: (id) => { timers.delete(id) },
    },
  })
  return { ...page, timers, mount: () => mount(), dispose: () => dispose() }
}
const channels = { data: { success: true, data: [{ id: 'channel' }] } }
const history = { data: { success: true, data: { items: [{ id: 'delivery' }], next_before: null } } }

test('unmount during initial channel load aborts it and prevents late polling or history requests', async () => {
  const pending = deferred(), requests = []
  const page = createPage((url, options) => { requests.push({ url, options }); return pending.promise })
  const mounted = page.mount()
  page.dispose()
  // A late response is intentional: clients and mocks may still settle after cancellation.
  pending.resolve(channels)
  await mounted
  assert.equal(page.timers.size, 0)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].options?.signal.aborted, true)
  assert.equal(page.channels.value.length, 0)
})

test('unmount during history loading discards late results and does not create a timer', async () => {
  const pending = deferred(), started = deferred()
  let signal
  const page = createPage((url, options) => {
    if (url.endsWith('/channels')) return Promise.resolve(channels)
    signal = options.signal
    started.resolve()
    return pending.promise
  })
  const mounted = page.mount()
  await started.promise
  page.dispose()
  pending.resolve(history)
  await mounted
  assert.equal(signal?.aborted, true)
  assert.equal(page.deliveries.value.length, 0)
  assert.equal(page.timers.size, 0)
})

test('normal polling is removed on unmount and an already queued callback cannot make requests', async () => {
  const requests = []
  const page = createPage(async (url) => { requests.push(url); return url.endsWith('/channels') ? channels : history })
  await page.mount()
  assert.equal(page.channels.value.length, 1)
  assert.equal(page.deliveries.value.length, 1)
  assert.equal(page.timers.size, 1)
  const callback = [...page.timers.values()][0]
  page.dispose()
  callback()
  assert.equal(page.timers.size, 0)
  assert.equal(requests.length, 2)
})

test('a cancelled initial request does not set an error after unmount', async () => {
  const page = createPage((_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { code: 'ERR_CANCELED' })))
  }))
  const mounted = page.mount()
  page.dispose()
  await mounted
  assert.equal(page.loadFailed.value, false)
  assert.equal(page.historyFailed.value, false)
  assert.equal(page.timers.size, 0)
})
