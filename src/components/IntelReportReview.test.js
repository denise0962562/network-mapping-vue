import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { computed, nextTick, ref } from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import * as intel from '../utils/threatIntel.js'
import * as reportHelpers from '../utils/intelReportReview.js'
const { descriptor } = parse(readFileSync(new URL('./IntelReportReview.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'report-review' })
const source = compiled.scriptSetupAst.filter(n => n.type === 'ImportDeclaration').reverse().reduce((s, n) => s.slice(0, n.start) + s.slice(n.end), descriptor.scriptSetup.content)
function page(http) {
  let dispose
  const events = []
  const state = vm.runInNewContext(`${source}\n;({open,load,locate,submit,decideAll,closed,dialog,records,decisions,attribution,article,selected,focused,mark,missing,items,blocked,reason,error})`, { ...intel, ...reportHelpers, ref, computed, nextTick, AbortController, http, onBeforeUnmount: fn => { dispose = fn }, defineEmits: () => (...args) => events.push(args), defineExpose: () => {} })
  return { ...state, events, dispose: () => dispose() }
}
function response(records, body = '恶意 DNS\n192[.]0[.]2[.]1') {
  return { data: { data: { article: { id: 'article', body, body_hash: 'snapshot-hash' }, records } } }
}
function record(id = 'ioc', value = '192.0.2.1') { return { id, type: 'ip', value, status: 'pending', content_hash: `hash-${id}`, payload: {} } }

test('report review stays silent when all selected IOCs exist and warns only about missing values', async () => {
  const p = page({ get: async () => response([record(), record('missing', '198.51.100.1')]) })
  await p.open({ article_id: 'article' })
  assert.equal(p.missing.value.length, 1)
  assert.equal(p.missing.value[0].id, 'missing')
  p.decisions.value.missing = ''
  assert.equal(p.missing.value.length, 0)
  let scrolled = false; p.mark.value = { scrollIntoView: () => { scrolled = true } }
  await p.locate(p.records.value[0])
  assert.equal(p.focused.value.quote, '192[.]0[.]2[.]1'); assert.equal(scrolled, true)
  p.dispose()
})

test('one report submits all selected versions beyond a record-list page and preserves per-IOC rejection', async () => {
  const records = Array.from({ length: 60 }, (_, i) => record(`ioc-${i}`, `192.0.2.${i + 1}`))
  const sent = []
  const p = page({ get: async () => response(records, records.map(r => r.value).join('\n')), post: async (url, data) => { sent.push({ url, data }) } })
  await p.open({ article_id: 'article' }); p.reason.value = ' checked report '
  p.decisions.value['ioc-1'] = 'rejected'; p.decisions.value['ioc-2'] = ''
  assert.equal(p.missing.value.length, 0)
  await p.submit()
  assert.equal(sent.length, 1); assert.equal(sent[0].url, '/api/intel/articles/article/review')
  assert.equal(sent[0].data.items.length, 59)
  assert.equal(sent[0].data.body_hash, 'snapshot-hash'); assert.equal(sent[0].data.reason, 'checked report')
  assert.equal(sent[0].data.items.find(r => r.id === 'ioc-1').decision, 'rejected')
  assert.equal('attribution' in sent[0].data.items.find(r => r.id === 'ioc-1'), false)
  assert.equal(p.events[0][0], 'complete')
  p.dispose()
})

test('conflicting batch review preserves the draft and cannot approve without a loaded snapshot', async () => {
  const p = page({ get: async () => response([record()]), post: async () => { throw { response: { status: 409, data: { code: 'intel_revision_conflict' } } } } })
  await p.open({ article_id: 'article' }); p.reason.value = 'keep this explanation'
  await p.submit()
  assert.match(p.error.value, /变化/); assert.equal(p.reason.value, 'keep this explanation')
  assert.equal(p.decisions.value.ioc, 'approved'); assert.equal(p.events.length, 0)
  p.article.value.body = ''
  assert.equal(p.blocked.value, true)
  p.decideAll('rejected'); assert.equal(p.blocked.value, false)
  p.dispose()
})

test('late report loads and responses after unmount cannot replace the current review', async () => {
  let resolve
  const pending = new Promise(done => { resolve = done })
  const p = page({ get: url => url.includes('/old/') ? pending : Promise.resolve(response([record('new')])) })
  const old = p.open({ article_id: 'old' })
  await p.open({ article_id: 'new' }); resolve(response([record('old')]))
  await old; assert.equal(p.records.value[0].id, 'new')
  p.dispose()
})

test('a queued close event cannot abort a newly opened report', async () => {
  let resolve
  const pending = new Promise(done => { resolve = done })
  const p = page({ get: () => pending })
  p.dialog.value = { open: false, showModal() { this.open = true } }
  const opening = p.open({ article_id: 'new' })
  p.closed() // A previous close event can arrive after showModal has reopened it.
  resolve(response([record('new')]))
  await opening
  assert.equal(p.records.value[0]?.id, 'new')
  p.dispose()
})
