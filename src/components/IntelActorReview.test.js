import { tr, i18n } from '../i18n/index.js'
import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { computed, ref, watch } from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'

const { descriptor } = parse(readFileSync(new URL('./IntelActorReview.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'actor-review' })
const source = compiled.scriptSetupAst.filter(n => n.type === 'ImportDeclaration').reverse().reduce((s, n) => s.slice(0, n.start) + s.slice(n.end), descriptor.scriptSetup.content)
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function response(id = 'G0001') { return { data: { data: { items: [{ attack_id: id, name: 'Fixture actor' }] } } } }
function review(http, initialDecision = null) {
  const props = { record: { id: 'record', payload: { actor_name: 'Fixture actor' } }, initialDecision }
  const decisions = []
  const state = localizedVm(`${source}\n;({load,search,publish,action,actorId,name,query,options,currentActor,searchState,results,loading})`, {
    computed, ref, watch, AbortController, http, intelError: String,
    defineProps: () => props, defineEmits: () => (event, decision) => { decisions.push(JSON.parse(JSON.stringify(decision))) },
    onMounted: () => {}, onBeforeUnmount: () => {},
  })
  return { ...state, props, decisions }
}

test('candidate loading publishes the displayed actor for select and alias decisions', async () => {
  for (const action of ['select', 'alias']) {
    const pending = deferred(), p = review({ get: () => pending.promise })
    const loading = p.load()
    assert.equal(p.loading.value, true)
    p.action.value = action; p.publish()
    assert.equal(p.decisions.at(-1).actor_id, '')
    pending.resolve(response()); await loading
    assert.equal(p.actorId.value, 'G0001')
    assert.deepEqual(p.decisions.at(-1), { action, actor_id: 'G0001' })
  }
})

test('restoring an attribution decision publishes its fallback without replacing a saved actor', async () => {
  for (const actor_id of ['', 'G0099']) {
    const p = review({ get: async () => response() }, { action: 'alias', actor_id })
    await p.load()
    assert.equal(p.actorId.value, actor_id || 'G0001')
    assert.equal(p.currentActor.value.attack_id, actor_id || 'G0001')
    assert.deepEqual(p.decisions.at(-1), { action: 'alias', actor_id: p.actorId.value })
  }
})

test('candidate completion preserves an action changed while loading', async () => {
  for (const action of ['keep', 'unassigned', 'create']) {
    const pending = deferred(), p = review({ get: () => pending.promise })
    const loading = p.load()
    p.action.value = action; p.name.value = ' Human choice '; p.publish()
    pending.resolve(response()); await loading
    assert.deepEqual(p.decisions.at(-1), action === 'create' ? { action, name: 'Human choice' } : { action })
  }
})

test('an obsolete candidate response cannot publish a decision for the current record', async () => {
  const old = deferred()
  const p = review({ get: url => url.includes('/record/') ? old.promise : Promise.resolve(response('G0002')) })
  const first = p.load()
  p.props.record = { id: 'new-record', payload: { actor_name: 'New actor' } }
  await p.load()
  p.action.value = 'select'; p.publish()
  const count = p.decisions.length
  old.resolve(response()); await first
  assert.equal(p.actorId.value, 'G0002')
  assert.equal(p.decisions.length, count)
  assert.deepEqual(p.decisions.at(-1), { action: 'select', actor_id: 'G0002' })
})

test('search replaces unrelated candidates and preserves the explicit attribution choice', async () => {
  const requests = []
  const p = review({ get: async (url, config) => {
    requests.push({ url, params: config?.params })
    return url.endsWith('/attribution') ? response() : { data: { data: { items: [
      { attack_id: 'G0002', name: 'Second actor', active: true },
      { attack_id: 'G0003', name: 'Inactive actor', active: false },
    ] } } }
  } })
  await p.load()
  p.action.value = 'select'; p.publish()
  const count = p.decisions.length
  p.query.value = ' Second '
  await p.search()
  assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1))), { url: '/api/intel/entities', params: { kind: 'actor', q: 'Second' } })
  assert.deepEqual(Array.from(p.options.value, item => item.attack_id), ['G0002'])
  assert.equal(p.searchState.value, 'success')
  assert.equal(p.actorId.value, 'G0001')
  assert.equal(p.currentActor.value.attack_id, 'G0001')
  assert.equal(p.decisions.length, count)
  p.actorId.value = 'G0002'; p.publish()
  assert.deepEqual(p.decisions.at(-1), { action: 'select', actor_id: 'G0002' })

  // A second search must not discard a choice made from the first search.
  await p.search()
  assert.equal(p.currentActor.value.attack_id, 'G0002')
})

test('empty and failed searches clear obsolete results without changing the chosen actor', async () => {
  let fail = false
  const p = review({ get: async url => {
    if (url.endsWith('/attribution')) return response()
    if (fail) throw new Error('Search unavailable')
    return { data: { data: { items: [] } } }
  } })
  await p.load()
  await p.search()
  assert.equal(p.searchState.value, 'success')
  assert.equal(p.options.value.length, 0)
  assert.equal(p.currentActor.value.attack_id, 'G0001')
  fail = true
  await p.search()
  assert.equal(p.searchState.value, 'error')
  assert.equal(p.options.value.length, 0)
  assert.equal(p.actorId.value, 'G0001')
})

test('a search completing after switching records cannot replace the new candidates', async () => {
  const pending = deferred()
  const p = review({ get: url => url === '/api/intel/entities' ? pending.promise : Promise.resolve(response('G0001')) })
  await p.load()
  const searching = p.search()
  p.props.record = { id: 'new-record', payload: { actor_name: 'New actor' } }
  await p.load()
  pending.resolve({ data: { data: { items: [{ attack_id: 'G0099', active: true }] } } })
  await searching
  assert.equal(p.searchState.value, 'idle')
  assert.deepEqual(Array.from(p.options.value, item => item.attack_id), ['G0001'])
  assert.equal(p.results.value.length, 0)
})

// Existing business fixtures select Chinese explicitly; locale behavior has its own tests.
function localizedVm(code, context, options) {
  i18n.global.locale.value = 'zh-CN'
  return vm.runInNewContext(code, { tr, ...context }, options)
}
