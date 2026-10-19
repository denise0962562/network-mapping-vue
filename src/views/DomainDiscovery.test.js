import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { computed, ref, reactive, watch } from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { discoveryReason, canVerify, selectPage } from '../utils/domainDiscovery.js'
const { descriptor } = parse(readFileSync(new URL('./DomainDiscovery.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'discovery-lifecycle' })
const source = compiled.scriptSetupAst.filter(n => n.type === 'ImportDeclaration').reverse().reduce((s, n) => s.slice(0, n.start) + s.slice(n.end), descriptor.scriptSetup.content)
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function page(get, post = async () => ({ data: { data: { task_ids: ['task'] } } })) {
  let mounted, dispose; const timers = new Map(); let count = 0
  const p = vm.runInNewContext(`${source}\n;({jobs,activeId,evidence,loading,selected,openJob,verify,poll})`, {
    computed, ref, watch, AbortController, discoveryReason, canVerify, selectPage,
    useRoute: () => reactive({ params: {}, query: {} }), useRouter: () => ({ push: () => {} }),
    http: { get, post }, document: { visibilityState: 'visible' },
    onMounted: fn => { mounted = fn }, onBeforeUnmount: fn => { dispose = fn },
    setTimeout: fn => { timers.set(++count, fn); return count }, clearTimeout: id => timers.delete(id),
  })
  return { ...p, mount: () => mounted(), dispose: () => dispose(), timers }
}
test('late discovery results cannot replace a newly selected pending job', async () => {
  const result = deferred(), p = page(() => result.promise)
  p.jobs.value = [{ id: 'a', status: 'succeeded' }, { id: 'b', status: 'pending' }]
  const pending = p.openJob('a')
  assert.equal(p.loading.value, true)
  await p.openJob('b')
  assert.equal(p.loading.value, false)
  result.resolve({ data: { data: { evidence: { candidates: [] }, excluded: [], dns_tasks: [] } } })
  await pending
  assert.equal(p.activeId.value, 'b'); assert.equal(p.evidence.value, null)
  p.dispose()
})
test('unmount aborts requests and prevents late jobs or polling', async () => {
  const pending = deferred(); let signal; let calls = 0
  const p = page((url, options) => { calls++; signal = options.signal; return pending.promise })
  const mount = p.mount(); p.dispose(); assert.equal(signal.aborted, true)
  pending.resolve({ data: { data: [{ id: 'a', status: 'pending' }] } }); await mount; await p.poll()
  assert.equal(p.jobs.value.length, 0); assert.equal(p.timers.size, 0); assert.equal(calls, 1)
})
test('DNS submission carries only selected discovered names and reloads submission receipts', async () => {
  const sent = []
  const p = page(async () => ({ data: { data: { evidence: { candidates: [] }, excluded: [], dns_tasks: [{ domain: 'api.example.com', task_id: 'task' }] } } }), async (url, body) => { sent.push({ url, body }); return { data: { data: { task_ids: ['task'] } } } })
  p.jobs.value = [{ id: 'job', status: 'succeeded' }]; p.activeId.value = 'job'; p.selected.value = ['api.example.com']
  await p.verify()
  assert.equal(sent[0].url, '/api/domain-discovery/jobs/job/dns-tasks')
  assert.deepEqual(Array.from(sent[0].body.domains), ['api.example.com'])
  assert.equal(p.selected.value.length, 0)
  p.dispose()
})
