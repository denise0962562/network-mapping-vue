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
  const state = vm.runInNewContext(`${source}\n;({load,publish,action,actorId,name,loading})`, {
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
