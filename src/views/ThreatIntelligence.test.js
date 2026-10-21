import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { computed, nextTick, ref, watch } from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import * as intel from '../utils/threatIntel.js'
import { articleIocLocations } from '../utils/intelReportReview.js'
const { descriptor } = parse(readFileSync(new URL('./ThreatIntelligence.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'intel-lifecycle' })
const source = compiled.scriptSetupAst.filter(n => n.type === 'ImportDeclaration').reverse().reduce((s, n) => s.slice(0, n.start) + s.slice(n.end), descriptor.scriptSetup.content)
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function readyResponse() { return { data: { data: { ready: true } } } }
function page(http, routeQuery = {}) {
  let dispose; const timers = new Map(); let count = 0
  const p = vm.runInNewContext(`${source}\n;({loadSettings,tab,records,articles,total,query,settings,sourceForm,hostsText,selected,reason,reviewDecision,article,refresh,saveSource,submitReview,openReview,loadReviewArticle,poll,openImport,uploadImport,importFile,importSource,uploadProgress,kindChanged,importError,cancelImport,retryArticle,actorDecision,error,notice,locateEvidence,focusedEvidence,focusedExcerpt,evidenceMark,showSourceDetails,copySourceId,sourceDetails,sourceCopyMessage,sourceDetailsDialog,confirmDelete,deleteItem,deleteTarget,deleteDialog,managementError,editArticle,saveArticle,articleEditForm,articleEditDialog,articleEditLoading,busy})`, {
    ...intel, articleIocLocations, computed, nextTick, ref, watch, AbortController, TextEncoder, TextDecoder, http, formatDateTime: v => v, useRoute: () => ({ query: routeQuery }),
    document: { visibilityState: 'visible' }, navigator: { clipboard: { writeText: async () => {} } }, onMounted: () => {}, onBeforeUnmount: fn => { dispose = fn },
    setTimeout: fn => { timers.set(++count, fn); return count }, clearTimeout: id => timers.delete(id),
  })
  return { ...p, dispose: () => dispose(), timers }
}
test('returning from report review restores its list tab and ignores unknown tabs', () => {
  for (const tab of ['articles', 'review']) assert.equal(page({}, { tab }).tab.value, tab)
  assert.equal(page({}, { tab: 'unknown' }).tab.value, 'sources')
})
test('source details opens with the selected source and resets the copy status on reselection', async () => {
  const p = page({})
  let opened = 0
  p.sourceDetailsDialog.value = { showModal() { opened++ } }
  p.showSourceDetails({ id: 'first', name: 'First source' })
  assert.equal(opened, 1)
  assert.equal(p.sourceDetails.value.id, 'first')
  await p.copySourceId()
  assert.equal(p.sourceCopyMessage.value, '来源 ID 已复制。')
  p.showSourceDetails({ id: 'second', name: 'Second source' })
  assert.equal(opened, 2)
  assert.equal(p.sourceDetails.value.name, 'Second source')
  assert.equal(p.sourceCopyMessage.value, '')
  p.dispose()
})
test('late responses cannot overwrite the selected tab results', async () => {
  const pending = deferred()
  const p = page({ get: url => url.endsWith('/records') ? pending.promise : Promise.resolve({ data: { data: { items: [{ id: 'article' }] } } }) })
  p.tab.value = 'records'; const first = p.refresh()
  p.tab.value = 'articles'; await p.refresh()
  pending.resolve({ data: { data: { items: [{ id: 'obsolete' }], total: 1 } } }); await first
  assert.equal(p.articles.value[0].id, 'article'); assert.equal(p.records.value.length, 0)
  p.dispose()
})
test('switching from offline exports restores a valid transport for API and report sources', () => {
  const p = page({})
  for (const kind of ['mitre_stix', 'eset_github', 'threatfox', 'rss']) {
    p.sourceForm.value.kind = 'threatfox_export'; p.kindChanged()
    assert.equal(p.sourceForm.value.transport, 'upload')
    p.sourceForm.value.kind = kind; p.kindChanged()
    assert.equal(p.sourceForm.value.transport, 'https', kind)
    assert.equal(p.sourceForm.value.interval_seconds, intel.defaultIntervals[kind])
  }
  p.dispose()
})
test('upload progress uses the selected file size when the browser omits total', async () => {
  const pending = deferred(); let options
  const p = page({ post: (url, file, config) => { if (url.endsWith('/check')) return Promise.resolve(readyResponse()); options = config; return pending.promise }, get: async () => ({ data: { data: { items: [] } } }) })
  p.openImport({ id: 'offline-source', revision: 1 }); p.importFile.value = new Blob(['x'.repeat(100)])
  const upload = p.uploadImport()
  await new Promise(setImmediate)
  assert.equal(p.uploadProgress.value, null) // indeterminate until the browser reports bytes
  options.onUploadProgress({ loaded: 25 })
  assert.equal(p.uploadProgress.value, 25)
  pending.resolve({}); await upload
  assert.equal(p.uploadProgress.value, 100)
  p.dispose()
})
test('upload errors stay visible inside the dialog and preserve the file for retry', async () => {
  const p = page({ post: async () => { throw { response: { status: 413, data: '<html>request too large</html>' } } } })
  const file = new Blob(['fixture'])
  p.openImport({ id: 'offline-source', revision: 1 }); p.importFile.value = file
  await p.uploadImport()
  assert.match(p.importError.value, /代理|大小/)
  assert.equal(p.importFile.value, file)
  p.dispose()
})
test('cancelling an unresponsive upload aborts only that request', async () => {
  const p = page({ post: (url, file, options) => new Promise((resolve, reject) => { options.signal.addEventListener('abort', () => reject({ code: 'ERR_CANCELED' })) }) })
  p.openImport({ id: 'offline-source', revision: 1 }); p.importFile.value = new Blob(['fixture'])
  const upload = p.uploadImport(); p.cancelImport(); await upload
  assert.match(p.importError.value, /取消/)
  p.dispose()
})
test('no file bytes are sent until the server confirms readiness', async () => {
  const ready = deferred(), calls = []
  const p = page({ post: (url, body, options) => { calls.push({ url, body, options }); return url.endsWith('/check') ? ready.promise : Promise.resolve({}) }, get: async () => ({ data: { data: { items: [] } } }) })
  const file = new Blob(['official offline export'])
  p.openImport({ id: 'offline-source', revision: 4 }); p.importFile.value = file
  const upload = p.uploadImport()
  assert.equal(calls.length, 1); assert.match(calls[0].url, /\/import\/check$/)
  assert.equal(calls[0].body, undefined); assert.equal(calls[0].options.timeout, 15000)
  assert.equal(calls[0].options.params.expected_revision, 4)
  ready.resolve(readyResponse()); await upload
  assert.equal(calls.length, 2); assert.equal(calls[1].body, file)
  assert.equal(calls[0].options.signal, calls[1].options.signal)
  p.dispose()
})
test('cache failure at preflight preserves the file and never starts the upload', async () => {
  const calls = []
  const p = page({ post: async url => { calls.push(url); throw { response: { data: { code: 'intel_import_cache_unavailable' } } } } })
  const file = new Blob(['fixture'])
  p.openImport({ id: 'offline-source', revision: 1 }); p.importFile.value = file
  await p.uploadImport()
  assert.equal(calls.length, 1); assert.match(calls[0], /\/check$/)
  assert.match(p.importError.value, /后端进程.*NM_INTEL_CACHE_ROOT/)
  assert.equal(p.importFile.value, file); assert.equal(p.uploadProgress.value, null)
  p.dispose()
})
test('an HTML page or malformed success response cannot acknowledge readiness', async () => {
  for (const response of [{ data: '<html>login</html>' }, { data: { data: { ready: false } } }]) {
    const calls = []
    const p = page({ post: async url => { calls.push(url); return response } })
    p.openImport({ id: 'offline-source', revision: 1 }); p.importFile.value = new Blob(['fixture'])
    await p.uploadImport()
    assert.equal(calls.length, 1); assert.match(p.importError.value, /准备确认/)
    p.dispose()
  }
})
test('a late successful preflight cannot upload after cancellation or unmount', async () => {
  for (const stop of ['cancelImport', 'dispose']) {
    const ready = deferred(), calls = []
    const p = page({ post: url => { calls.push(url); return ready.promise } })
    p.openImport({ id: 'offline-source', revision: 1 }); p.importFile.value = new Blob(['fixture'])
    const upload = p.uploadImport(); p[stop](); ready.resolve({}); await upload
    assert.equal(calls.length, 1, stop)
    if (stop === 'cancelImport') { assert.match(p.importError.value, /取消/); p.dispose() }
  }
})
test('offline import sends the file body and source revision without scheduling or AI requests', async () => {
  const sent = [], pending = deferred()
  const p = page({ post: (url, body, options) => { if (url.endsWith('/check')) return Promise.resolve(readyResponse()); sent.push({ url, body, options }); return pending.promise }, get: async () => ({ data: { data: { items: [] } } }) })
  const file = new Blob(['type,value\ndomain,history.example\n'], { type: 'text/csv' })
  p.openImport({ id: 'offline-source', revision: 4 }); p.importFile.value = file
  const upload = p.uploadImport()
  await p.uploadImport() // duplicate click is blocked
  assert.equal(sent.length, 1); assert.equal(sent[0].url, '/api/intel/sources/offline-source/import')
  assert.equal(sent[0].body, file); assert.equal(sent[0].options.params.expected_revision, 4)
  assert.equal(sent[0].options.headers['Content-Type'], 'application/octet-stream')
  sent[0].options.onUploadProgress({ loaded: 25, total: 100 })
  assert.equal(p.uploadProgress.value, 25)
  pending.resolve({}); await upload
  assert.equal(p.importFile.value, null)
  assert.equal(sent[0].options.signal.aborted, false)
  p.dispose()
})


test('review request approves exactly the displayed record version', async () => {
  const sent = []
  const p = page({ post: async (url, body) => { sent.push({ url, body }); return {} }, get: async url => ({ data: { data: url.includes('/articles/') ? { body: 'The saved report identifies this IOC as malicious.' } : { items: [], total: 0 } } }) })
  p.tab.value = 'review'; await p.openReview({ id: 'r1', article_id: 'a1', content_hash: 'version-one', origin: 'ai', status: 'pending' }); p.reason.value = '核对了原文和具体 IOC 角色'
  await p.submitReview()
  assert.equal(sent[0].url, '/api/intel/records/r1/review')
  assert.equal(sent[0].body.content_hash, 'version-one'); assert.equal(sent[0].body.decision, 'approved')
  assert.equal('origin' in sent[0].body, false)
  p.dispose()
})
test('failed or empty AI snapshots cannot be approved', async () => {
  for (const snapshot of [null, { body: null }, { body: '   ' }]) {
    const sent = []
    const p = page({ get: async () => { if (snapshot === null) throw new Error('snapshot unavailable'); return { data: { data: snapshot } } }, post: async (...args) => { sent.push(args) } })
    await p.openReview({ id: 'r1', article_id: 'a1', origin: 'ai', status: 'pending', content_hash: 'version-one' })
    p.reason.value = 'A reason cannot replace reviewing the source text.'
    await p.submitReview()
    assert.equal(sent.length, 0, `must block approval for ${JSON.stringify(snapshot)}`)
    p.dispose()
  }
})
test('loading AI snapshots block submission until the exact snapshot arrives', async () => {
  const pending = deferred(), sent = []
  const p = page({ get: url => url.includes('/articles/') ? pending.promise : Promise.resolve({ data: { data: { items: [] } } }), post: async (...args) => { sent.push(args) } })
  const opening = p.openReview({ id: 'r1', article_id: 'a1', origin: 'ai', status: 'pending', content_hash: 'version-one' })
  p.reason.value = 'Check source evidence.'
  await p.submitReview()
  assert.equal(sent.length, 0)
  pending.resolve({ data: { data: { body: 'Saved source evidence for this IOC.' } } }); await opening
  await p.submitReview()
  assert.equal(sent.length, 1)
  p.dispose()
})
test('missing AI snapshot does not prevent rejecting or revoking evidence', async () => {
  for (const decision of ['rejected', 'revoked']) {
    const sent = []
    const p = page({ get: async () => { throw new Error('snapshot unavailable') }, post: async (...args) => { sent.push(args) } })
    await p.openReview({ id: 'r1', article_id: 'a1', origin: 'ai', status: decision === 'revoked' ? 'approved' : 'pending', content_hash: 'version-one' }, decision)
    p.reason.value = 'Evidence must not remain active without adequate support.'
    await p.submitReview()
    assert.equal(sent.length, 1)
    assert.equal(sent[0][1].decision, decision)
    p.dispose()
  }
})
test('pending snapshot requests do not block rejecting or revoking AI evidence', async () => {
  for (const decision of ['rejected', 'revoked']) {
    const pending = deferred(), sent = []
    const p = page({ get: url => url.includes('/articles/') ? pending.promise : Promise.resolve({ data: { data: { items: [] } } }), post: async (...args) => { sent.push(args) } })
    const opening = p.openReview({ id: 'r1', article_id: 'a1', origin: 'ai', status: decision === 'revoked' ? 'approved' : 'pending', content_hash: 'version-one' }, decision)
    p.reason.value = 'Unsupported evidence must be removable while the snapshot is loading.'
    await p.submitReview()
    assert.equal(sent.length, 1, `${decision} must not wait for the snapshot request`)
    assert.equal(sent[0][1].decision, decision)
    assert.equal(sent[0][1].content_hash, 'version-one')
    pending.resolve({ data: { data: { body: 'Late snapshot response.' } } }); await opening
    p.dispose()
  }
})
test('retrying a failed snapshot preserves the reason and restores approval only after success', async () => {
  let attempts = 0; const sent = []
  const p = page({ get: async () => { if (++attempts === 1) throw new Error('temporary failure'); return { data: { data: { body: 'The verified snapshot identifies the malicious IOC.' } } } }, post: async (...args) => { sent.push(args) } })
  await p.openReview({ id: 'r1', article_id: 'a1', origin: 'ai', status: 'pending', content_hash: 'version-one' })
  p.reason.value = 'Keep this review draft while retrying.'
  await p.submitReview(); assert.equal(sent.length, 0)
  await p.loadReviewArticle()
  assert.equal(p.reason.value, 'Keep this review draft while retrying.')
  await p.submitReview(); assert.equal(sent.length, 1)
  p.dispose()
})
test('AI evidence without an article is blocked while structured review still works', async () => {
  const sent = []
  const p = page({ get: async () => ({ data: { data: { items: [] } } }), post: async (...args) => { sent.push(args) } })
  await p.openReview({ id: 'r1', origin: 'ai', status: 'pending', content_hash: 'ai-version' }); p.reason.value = 'No source snapshot.'
  await p.submitReview(); assert.equal(sent.length, 0)
  await p.openReview({ id: 'r2', origin: 'structured', status: 'pending', content_hash: 'structured-version' }); p.reason.value = 'Verified official structured record.'
  await p.submitReview(); assert.equal(sent.length, 1)
  assert.equal(sent[0][0], '/api/intel/records/r2/review')
  p.dispose()
})
test('late snapshot cannot replace a newer review selection', async () => {
  const old = deferred()
  const p = page({ get: url => url.endsWith('/a') ? old.promise : Promise.resolve({ data: { data: { body: 'new snapshot' } } }) })
  const first = p.openReview({ id: 'r1', article_id: 'a' })
  await p.openReview({ id: 'r2', article_id: 'b' })
  old.resolve({ data: { data: { body: 'old snapshot' } } }); await first
  assert.equal(p.article.value.body, 'new snapshot'); assert.equal(p.selected.value.id, 'r2')
  p.dispose()
})
test('unmount aborts requests and prevents new polling timers', async () => {
  const pending = deferred(); let signal
  const p = page({ get: (url, options) => { signal = options.signal; return pending.promise } })
  p.tab.value = 'records'; const first = p.refresh(); p.dispose()
  assert.equal(signal.aborted, true)
  pending.resolve({ data: { data: { items: [{ id: 'late' }], total: 1 } } }); await first; await p.poll()
  assert.equal(p.records.value.length, 0); assert.equal(p.timers.size, 0)
})







test('source location clears across records and ignores mismatched ranges', async () => {
  const p = page({ get: async () => ({ data: { data: { body: '恶意 DNS\n192[.]0[.]2[.]1' } } }) })
  await p.openReview({ origin: 'ai', article_id: 'first' })
  const span = { start: new TextEncoder().encode('恶意 DNS\n').length, end: new TextEncoder().encode(p.article.value.body).length, quote: '192[.]0[.]2[.]1' }
  let scrolled = false
  p.evidenceMark.value = { scrollIntoView: () => { scrolled = true } }
  await p.locateEvidence(span)
  assert.equal(p.focusedExcerpt.value.quote, span.quote)
  assert.equal(scrolled, true)
  await p.openReview({ origin: 'ai', article_id: 'second' })
  assert.equal(p.focusedEvidence.value, null)
  await p.locateEvidence({ ...span, quote: 'wrong' })
  assert.equal(p.focusedExcerpt.value, null)
  p.dispose()
})

test('accepted retry immediately marks queue state and duplicate clicks cannot submit twice', async () => {
  const pending = deferred(); let calls = 0
  const p = page({ post: () => { calls++; return pending.promise }, get: async () => ({ data: { data: { items: [] } } }) })
  p.tab.value = 'articles'
  const row = { id: 'article', status: 'proposed', error_code: 'old', extraction_metadata: { result: { parsed: 1 }, last_error: { code: 'old' } } }
  const first = p.retryArticle(row)
  await p.retryArticle(row)
  assert.equal(calls, 1)
  pending.resolve({ data: { data: { id: 'article', status: 'queued' } } }); await first
  assert.equal(row.status, 'queued'); assert.equal(row.error_code, null)
  assert.equal(row.extraction_metadata.result, undefined)
  assert.match(p.notice.value, /已入队/)
  p.dispose()
})
test('disabled source blocks retry without submitting or changing article state', async () => {
  let calls = 0
  const p = page({ post: async () => { calls++ }, get: async () => { calls++ } })
  const row = { id: 'article', source_enabled: false, status: 'proposed' }
  await p.retryArticle(row)
  assert.equal(calls, 0)
  assert.equal(row.status, 'proposed')
  assert.match(p.error.value, /来源已停用.*启用后再提取/)
  assert.equal(p.busy.value, false)
  p.dispose()
})
test('failed retry refreshes actual state and keeps its error visible', async () => {
  let refreshed = false
  const p = page({ post: async () => { throw { response: { data: { code: 'intel_source_disabled' } } } }, get: async () => { refreshed = true; return { data: { data: { items: [{ id: 'article', status: 'cancelled' }] } } } } })
  p.tab.value = 'articles'; await p.retryArticle({ id: 'article' })
  assert.equal(refreshed, true); assert.equal(p.articles.value[0].status, 'cancelled')
  assert.notEqual(p.error.value, '')
  p.dispose()
})
test('only approval submits a human attribution operation', async () => {
  let submitted
  const p = page({ post: async (url, body) => { submitted = body }, get: async () => ({ data: { data: { items: [] } } }) })
  p.selected.value = { id: 'ioc', origin: 'ai', content_hash: 'hash' }
  p.article.value = { body: 'original snapshot' }; p.reason.value = 'checked'
  p.actorDecision.value = { action: 'create', name: 'Local group' }
  await p.submitReview(); assert.equal(submitted.attribution.action, 'create')
  p.reviewDecision.value = 'rejected'; await p.submitReview()
  assert.equal(submitted.attribution, undefined)
  p.dispose()
})

 test('AI configuration is read-only here and links to the LLM page', async () => {
  const p = page({ get: async () => ({ data: { data: { settings: { ai_enabled: true, ai_model: 'current-model' } } } }) })
  await p.loadSettings()
  assert.equal(p.settings.value.ai_enabled, true)
  assert.equal(p.settings.value.ai_model, 'current-model')
  assert.match(descriptor.template.content, /to="\/llm\/basic"/)
  assert.doesNotMatch(descriptor.template.content, /v-model="settings\.ai_/)
  p.dispose()
})


test('delete requires deliberate confirmation and sends the displayed revision only once', async () => {
  const pending = deferred(), sent = []
  const p = page({ delete: (url, options) => { sent.push({ url, options }); return pending.promise }, get: async () => ({ data: { data: { items: [] } } }) })
  let opened = 0, closed = 0
  p.deleteDialog.value = { showModal() { opened++ }, close() { closed++ } }
  p.confirmDelete('sources', { id: 'source', name: '测试来源', revision: 7 })
  assert.equal(sent.length, 0); assert.equal(opened, 1)
  const first = p.deleteItem(); await p.deleteItem()
  assert.equal(sent.length, 1); assert.equal(sent[0].url, '/api/intel/sources/source')
  assert.equal(sent[0].options.data.expected_revision, 7)
  pending.resolve({}); await first
  assert.equal(closed, 1); assert.equal(p.deleteTarget.value, null)
  assert.match(p.notice.value, /来源已删除/)
  p.dispose()
})
test('delete conflicts keep the confirmation visible with an actionable error', async () => {
  const p = page({ delete: async () => { throw { response: { data: { code: 'intel_revision_conflict' } } } } })
  p.confirmDelete('articles', { id: 'article', title: '报告', revision: 3 })
  await p.deleteItem()
  assert.equal(p.deleteTarget.value.id, 'article'); assert.match(p.managementError.value, /刷新/)
  assert.equal(p.busy.value, false)
  p.dispose()
})
test('article edit loads the snapshot and submits both revisions without display-only fields', async () => {
  const calls = []
  const p = page({ get: async url => ({ data: { data: url.endsWith('/article') ? { revision: 4, title: ' 原标题 ', url: 'https://research.example/report', body: 'Saved evidence body' } : { items: [] } } }), put: async (url, body) => { calls.push({ url, body }) } })
  await p.editArticle({ id: 'article', source_id: 'source', source_name: '来源', current_source_revision: 8 })
  assert.equal(p.articleEditForm.value.body, 'Saved evidence body')
  p.articleEditForm.value.title = ' 修改标题 '
  await p.saveArticle()
  assert.equal(calls[0].url, '/api/intel/articles/article')
  assert.equal(calls[0].body.expected_article_revision, 4); assert.equal(calls[0].body.expected_revision, 8)
  assert.equal(calls[0].body.title, '修改标题'); assert.equal(calls[0].body.source_name, undefined)
  assert.equal(p.articleEditForm.value, null); assert.match(p.notice.value, /新快照/)
  p.dispose()
})
test('failed article saves preserve the draft and late loads cannot replace a newer selection', async () => {
  const pending = deferred()
  const p = page({ get: url => url.endsWith('/old') ? pending.promise : Promise.resolve({ data: { data: { revision: 1, title: 'new', url: 'https://research.example/new', body: 'new body' } } }), put: async () => { throw { response: { data: { code: 'intel_revision_conflict' } } } } })
  const first = p.editArticle({ id: 'old' }); await p.editArticle({ id: 'new' })
  pending.resolve({ data: { data: { title: 'old' } } }); await first
  assert.equal(p.articleEditForm.value.id, 'new')
  await p.saveArticle()
  assert.equal(p.articleEditForm.value.title, 'new'); assert.match(p.managementError.value, /刷新/)
  p.dispose()
})
