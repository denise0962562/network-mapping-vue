import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultIntervals, newSource, sourcePayload, settingsPayload, safeReference, originLabel, intelError } from './threatIntel.js'

test('trusted defaults expose configurable source intervals', () => {
  const source = newSource()
  assert.equal(source.require_review, false)
  assert.equal(defaultIntervals.mitre_stix, 86400)
  assert.equal(defaultIntervals.threatfox, 1800)
  assert.equal(source.expiry_months, 6)
})
test('DNS and upload transport failures explain the affected layer without rendering response bodies', () => {
  assert.match(intelError('intel_dns_failed'), /DNS/)
  assert.match(intelError('intel_proxy_dns_failed'), /代理服务器/)
  assert.match(intelError('intel_import_busy'), /作业/)
  assert.match(intelError('intel_import_cache_unavailable'), /后端进程.*NM_INTEL_CACHE_ROOT/)
  assert.match(intelError('intel_invalid_csv'), /CSV.*表头/)
  assert.match(intelError('intel_invalid_indicator_url'), /URL IOC/)
  assert.match(intelError('intel_invalid_ioc_document'), /JSON.*结构/)
  const message=intelError({ response: { status: 413, data: '<html>private internal response</html>' } })
  assert.match(message,/代理/); assert.equal(message.includes('private internal'),false)
  assert.match(intelError({code:'ECONNABORTED'}),/超时/)
})
test('offline source configuration omits remote addresses and credentials and keeps expiry editable', () => {
  const form = { ...newSource(), kind: 'threatfox_export', transport: 'upload', location: 'https://obsolete.example/file', auth_env: 'NM_INTEL_OLD_KEY', credential: 'not-for-offline', expiry_months: '12', import_status: { stage: 'ready' } }
  const body = sourcePayload(form, 'obsolete.example')
  assert.equal(body.location, ''); assert.equal(body.auth_env, '')
  assert.equal('credential' in body, false); assert.equal('import_status' in body, false)
  assert.deepEqual(body.allowed_hosts, []); assert.equal(body.expiry_months, 12)
  form.expiry_months = 0; assert.equal(sourcePayload(form, '').expiry_months, 0)
})
test('source edits submit revisions and exclude response-only fields', () => {
  const form = { ...newSource(), id: 'source', revision: 7, name: ' Official ', last_run: {}, credential_configured: true }
  const payload = sourcePayload(form, 'a.example\nb.example, c.example')
  assert.equal(payload.expected_revision, 7)
  assert.equal(payload.name, 'Official')
  assert.deepEqual(payload.allowed_hosts, ['a.example', 'b.example', 'c.example'])
  assert.equal('last_run' in payload, false)
  assert.equal('credential_configured' in payload, false)
  form.transport = 'local'; form.auth_env = 'NM_INTEL_OLD_KEY'
  assert.equal(sourcePayload(form, 'a.example').auth_env, '')
  assert.deepEqual(sourcePayload(form, 'a.example').allowed_hosts, [])
})
test('evidence links cannot execute code or carry credentials', () => {
  for (const value of ['javascript:alert(1)', 'http://example.com', 'https://user:key@example.com', null]) assert.equal(safeReference(value), null)
  assert.equal(safeReference('https://research.example/report'), 'https://research.example/report')
  assert.equal(originLabel({ origin: 'ai' }), 'AI · 人工审核')
  assert.equal(originLabel({ origin: 'structured', review_id: 'review' }), '结构化来源 · 人工审核')
})
test('credential writes preserve blank values and make clearing explicit', () => {
  const form = { ...newSource(), database_credential_configured: true, credential: 'raw-database-key' }
  assert.equal(sourcePayload(form, '').credential, 'raw-database-key')
  form.clear_credential = true
  const clear = sourcePayload(form, '')
  assert.equal(clear.clear_credential, true); assert.equal('credential' in clear, false)
  form.clear_credential = false; form.credential = ''
  assert.equal('credential' in sourcePayload(form, ''), false)
  assert.equal('database_credential_configured' in sourcePayload(form, ''), false)
  form.credential = 'must-not-send'; form.transport = 'local'
  assert.equal('credential' in sourcePayload(form, ''), false)
})
test('AI settings send only writeable configuration and deliberate credential changes', () => {
  const form = { ai_enabled: true, ai_endpoint: 'https://api.example/chat', ai_model: 'model', ai_key_env: '', credential: 'test-key', credential_source: 'database', ai_review_required: false }
  let body = settingsPayload(form)
  assert.equal(body.credential, 'test-key'); assert.equal(body.ai_key_env, '')
  assert.equal('credential_source' in body, false); assert.equal('ai_review_required' in body, false)
  form.clear_credential = true
  body = settingsPayload(form)
  assert.equal(body.clear_credential, true); assert.equal('credential' in body, false)
})
