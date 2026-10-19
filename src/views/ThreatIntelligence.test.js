import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { computed, ref } from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import * as intel from '../utils/threatIntel.js'
const { descriptor } = parse(readFileSync(new URL('./ThreatIntelligence.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'intel-lifecycle' })
const source = compiled.scriptSetupAst.filter(n => n.type === 'ImportDeclaration').reverse().reduce((s, n) => s.slice(0, n.start) + s.slice(n.end), descriptor.scriptSetup.content)
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function page(http) {
  let dispose; const timers = new Map(); let count = 0
  const p = vm.runInNewContext(`${source}\n;({tab,records,articles,total,query,settings,settingsRevision,sourceForm,hostsText,selected,reason,reviewDecision,article,refresh,saveSettings,saveSource,submitReview,openReview,loadReviewArticle,poll,openImport,uploadImport,importFile,importSource,uploadProgress,kindChanged,importError,cancelImport})`, {
    ...intel, computed, ref, AbortController, http, formatDateTime: v => v,
    document: { visibilityState: 'visible' }, onMounted: () => {}, onBeforeUnmount: fn => { dispose = fn },
    setTimeout: fn => { timers.set(++count, fn); return count }, clearTimeout: id => timers.delete(id),
  })
  return { ...p, dispose: () => dispose(), timers }
}
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
  const p = page({ post: (url, file, config) => { options = config; return pending.promise }, get: async () => ({ data: { data: { items: [] } } }) })
  p.openImport({ id: 'offline-source', revision: 1 }); p.importFile.value = new Blob(['x'.repeat(100)])
  const upload = p.uploadImport()
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
test('offline import sends the file body and source revision without scheduling or AI requests', async () => {
  const sent = [], pending = deferred()
  const p = page({ post: (url, body, options) => { sent.push({ url, body, options }); return pending.promise }, get: async () => ({ data: { data: { items: [] } } }) })
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
test('AI switch changes only extraction settings and carries the revision', async () => {
  const sent = []
  const p = page({ put: async (url, body) => { sent.push({ url, body }); return {} }, get: async () => ({ data: { data: { settings: { ai_enabled: false }, revision: 3, credential_configured: false } } }) })
  p.settingsRevision.value = 2; p.settings.value.ai_enabled = false
  await p.saveSettings()
  assert.equal(sent[0].url, '/api/intel/settings'); assert.equal(sent[0].body.expected_revision, 2)
  assert.equal(sent[0].body.settings.ai_enabled, false)
  assert.equal('ai_review_required' in sent[0].body.settings, false)
  p.dispose()
})
test('saved AI credential is cleared locally and is not resent by a later settings edit', async () => {
  const sent = []
  const p = page({ put: async (url, body) => { sent.push(body) }, get: async () => ({ data: { data: { settings: { ai_enabled: false, ai_endpoint: 'https://api.example/chat', ai_model: '', ai_key_env: '' }, revision: 3, credential_configured: true, database_credential_configured: true, credential_source: 'database' } } }) })
  p.settingsRevision.value = 2; p.settings.value.credential = 'test-only-key'
  await p.saveSettings()
  assert.equal(sent[0].settings.credential, 'test-only-key')
  assert.equal(p.settings.value.credential, '')
  await p.saveSettings()
  assert.equal('credential' in sent[1].settings, false)
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
