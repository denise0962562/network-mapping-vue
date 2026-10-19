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
  const p = vm.runInNewContext(`${source}\n;({jobs,activeId,activeJob,evidence,loading,error,selected,openJob,create,verify,cancel,poll})`, {
    computed, ref, watch, AbortController, discoveryReason, canVerify, selectPage,
    useRoute: () => reactive({ params: {}, query: {} }), useRouter: () => ({ push: () => {} }),
    http: { get, post }, document: { visibilityState: 'visible' },
    onMounted: fn => { mounted = fn }, onBeforeUnmount: fn => { dispose = fn },
    setTimeout: fn => { timers.set(++count, fn); return count }, clearTimeout: id => timers.delete(id),
  })
  return { ...p, mount: () => mounted(), dispose: () => dispose(), timers }
}
test('late discovery results cannot replace a newly selected pending job', async () => {
  const result = deferred(), p = page(url => url.endsWith('/results') ? result.promise : Promise.resolve({ data: { data: { id: url.split('/').at(-1), status: url.endsWith('/b') ? 'pending' : 'succeeded' } } }))
  p.jobs.value = [{ id: 'a', status: 'succeeded' }, { id: 'b', status: 'pending' }]
  const pending = p.openJob('a')
  await Promise.resolve()
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
  const p = page(async url => ({ data: { data: url.endsWith('/results') ? { evidence: { candidates: [] }, excluded: [], dns_tasks: [{ domain: 'api.example.com', task_id: 'task' }] } : { id: 'job', status: 'succeeded' } } }), async (url, body) => { sent.push({ url, body }); return { data: { data: { task_ids: ['task'] } } } })
  p.jobs.value = [{ id: 'job', status: 'succeeded' }]; p.activeId.value = 'job'; p.selected.value = ['api.example.com']
  await p.verify()
  assert.equal(sent[0].url, '/api/domain-discovery/jobs/job/dns-tasks')
  assert.deepEqual(Array.from(sent[0].body.domains), ['api.example.com'])
  assert.equal(p.selected.value.length, 0)
  p.dispose()
})

for (const status of ['succeeded', 'partial']) test(`opening an older ${status} source job does not depend on the latest 100 jobs`, async () => {
  const calls = [], evidence = { candidates: [{ name: 'api.example.com', relation: 'subdomain' }] }
  const p = page(async (url, { signal }) => {
    calls.push(url); assert.equal(signal.aborted, false)
    return { data: { data: url.endsWith('/results') ? { evidence } : { id: 'older', status } } }
  })
  p.jobs.value = Array.from({ length: 100 }, (_, i) => ({ id: `recent-${i}`, status: 'succeeded' }))
  await p.openJob('older')
  assert.deepEqual(calls, ['/api/domain-discovery/jobs/older', '/api/domain-discovery/jobs/older/results'])
  assert.equal(p.activeJob.value.id, 'older'); assert.deepEqual(JSON.parse(JSON.stringify(p.evidence.value)), evidence)
  assert.equal(p.loading.value, false); assert.equal(p.error.value, '')
  p.dispose()
})

test('creation can reuse a completed job outside the history window', async () => {
  const p = page(async url => ({ data: { data: url.endsWith('/jobs') ? [] : url.endsWith('/results') ? { evidence: { candidates: [] } } : { id: 'reused', status: 'succeeded' } } }),
    async () => ({ data: { data: { reused: true, job: { id: 'reused' } } } }))
  await p.create()
  assert.equal(p.activeId.value, 'reused'); assert.equal(p.activeJob.value.status, 'succeeded')
  assert.notEqual(p.evidence.value, null)
  p.dispose()
})

test('an older pending job is polled by ID until its results are ready', async () => {
  let status = 'pending'
  const p = page(async url => ({ data: { data: url.endsWith('/jobs') ? [] : url.endsWith('/results') ? { evidence: { candidates: [] } } : { id: 'older', status } } }))
  await p.openJob('older')
  assert.equal(p.activeJob.value.status, 'pending'); assert.equal(p.evidence.value, null)
  status = 'succeeded'
  await p.poll()
  assert.equal(p.activeJob.value.status, 'succeeded'); assert.notEqual(p.evidence.value, null)
  p.dispose()
})

test('late job detail cannot restore a superseded source job or request its results', async () => {
  const pending = deferred(), calls = []
  const p = page(url => { calls.push(url); return url.endsWith('/older') ? pending.promise : Promise.resolve({ data: { data: { id: 'current', status: 'pending' } } }) })
  const old = p.openJob('older')
  await p.openJob('current')
  pending.resolve({ data: { data: { id: 'older', status: 'succeeded' } } }); await old
  assert.equal(p.activeJob.value.id, 'current'); assert.equal(p.evidence.value, null)
  assert.equal(calls.some(url => url.endsWith('/results')), false)
  p.dispose()
})

test('a source job detail error is visible and does not request results', async () => {
  let calls = 0
  const p = page(async () => { calls++; throw { response: { data: { code: 'discovery_not_found' } } } })
  await p.openJob('missing')
  assert.equal(calls, 1); assert.equal(p.loading.value, false)
  assert.equal(p.error.value, discoveryReason('discovery_not_found'))
  p.dispose()
})

test('a poll started on an older job cannot reopen it after the user selects another job', async () => {
  const history = deferred(), calls = []
  const p = page(url => {
    calls.push(url)
    return url.endsWith('/jobs') ? history.promise : Promise.resolve({ data: { data: { id: url.split('/').at(-1), status: 'pending' } } })
  })
  await p.openJob('older')
  const poll = p.poll()
  await p.openJob('current')
  history.resolve({ data: { data: [] } }); await poll
  assert.equal(p.activeJob.value.id, 'current')
  assert.equal(calls.filter(url => url.endsWith('/older')).length, 1)
  p.dispose()
})

test('cancelling a job outside the history window refreshes its displayed status', async () => {
  let status = 'running'
  const p = page(async url => ({ data: { data: url.endsWith('/jobs') ? [] : { id: 'older', status } } }),
    async url => { assert.equal(url, '/api/domain-discovery/jobs/older/cancel'); status = 'cancelled' })
  await p.openJob('older'); await p.cancel()
  assert.equal(p.activeJob.value.status, 'cancelled'); assert.equal(p.evidence.value, null)
  p.dispose()
})
