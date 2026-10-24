import { i18n } from '../i18n/index.js'
i18n.global.locale.value = 'zh-CN'
import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultIntervals, newSource, sourcePayload, settingsPayload, safeReference, originLabel, intelError, articleDiagnosticRows, articleStatusLabel } from './threatIntel.js'

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
  assert.match(intelError('intel_invalid_indicator_url'), /TFTP.*TCP.*WS/)
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
  assert.equal(body.ai_timeout_seconds, 180)
  assert.equal(body.ai_max_output_tokens, 65536)
  form.ai_timeout_seconds = '600'
  assert.equal(settingsPayload(form).ai_timeout_seconds, 600)
  assert.equal('credential_source' in body, false); assert.equal('ai_review_required' in body, false)
  form.clear_credential = true
  body = settingsPayload(form)
  assert.equal(body.clear_credential, true); assert.equal('credential' in body, false)
})

test('article completion labels reflect actual records including historical empty successes and reviewed drafts', () => {
  assert.equal(articleStatusLabel({ status: 'proposed', record_count: 0, pending_count: 0 }), '提取已完成，未生成提议')
  assert.equal(articleStatusLabel({ status: 'succeeded', record_count: 0, pending_count: 0 }), '提取已完成，未生成提议')
  assert.equal(articleStatusLabel({ status: 'proposed', record_count: 4, pending_count: 2 }), '待审核（2 条）')
  assert.equal(articleStatusLabel({ status: 'succeeded', record_count: 4, pending_count: 2 }), '待审核（2 条）')
  assert.equal(articleStatusLabel({ status: 'proposed', record_count: 4, pending_count: 0 }), '提取已完成，无待审提议')
  assert.equal(articleStatusLabel({ status: 'proposed' }), '提取已完成')
  assert.equal(articleStatusLabel({ status: 'failed', pending_count: 0 }), '失败')
})
test('manual article sources keep wildcard hosts and omit legacy publisher binding', () => {
  const payload=sourcePayload({...newSource(),kind:'article',transport:'manual',publisher_id:' ZXhhbXBsZQ== ',location:'https://stale.example',auth_env:'NM_INTEL_STALE',credential:'must-not-send'},'mp.weixin.qq.com\nresearch.example')
  assert.equal(payload.location,'');assert.equal(payload.auth_env,'');assert.equal('publisher_id' in payload,false);assert.equal(payload.allowed_hosts.length,2);assert.ok(!Object.hasOwn(payload,'credential'))
})

test('article diagnostics distinguish AI failures and allowlist only scalar diagnostic fields', () => {
  assert.match(intelError('intel_ai_transport'), /AI 接口.*正文已保留/)
  assert.match(intelError('intel_ai_request_timeout'), /AI 接口请求超时/)
  assert.match(intelError('intel_ai_http_status'), /HTTP 状态/)
  assert.match(intelError('intel_ai_invalid_response'), /Chat Completions.*Responses/)
  const rows = articleDiagnosticRows({ stage: 'ai_request', http_status: 503, timeout: false, body: 'secret', authorization: 'Bearer secret', details: { key: 'secret' }, host: '<script>alert(1)</script>' })
  assert.equal(rows.find(r => r.key === 'stage').value, '请求 AI 接口')
  assert.equal(rows.find(r => r.key === 'http_status').value, '503')
  assert.equal(rows.find(r => r.key === 'timeout').value, '否')
  assert.equal(JSON.stringify(rows).includes('secret'), false)
  assert.deepEqual(articleDiagnosticRows(null), [])
  assert.deepEqual(articleDiagnosticRows({ phase: {} }), [])
})

test('AI JSON and completion diagnostics have readable messages without exposing model content', () => {
  assert.match(intelError('intel_ai_invalid_json'), /JSON.*解析位置.*结束原因/)
  assert.match(intelError('intel_ai_output_truncated'), /输出上限/)
  assert.match(intelError('intel_ai_empty_content'), /未返回有效回复/)
  assert.match(intelError('intel_ai_content_filtered'), /内容过滤/)
  assert.match(intelError('intel_ai_refused'), /拒答/)
  const rows = articleDiagnosticRows({ stage: 'ai_validate', finish_reason: 'stop', json_error_category: 'syntax', json_line: 2, json_column: 11, content_bytes: 128, content_format: 'markdown_fence', reason: 'markdown_fence', refusal_present: false, reasoning_content_present: true, content: 'private-response', refusal: 'private-refusal', reasoning_content: 'private-reasoning' })
  const field = key => rows.find(row => row.key === key)
  assert.match(field('finish_reason').value, /正常结束/)
  assert.match(field('json_error_category').value, /语法错误/)
  assert.equal(field('json_line').value, '2')
  assert.equal(field('json_column').value, '11')
  assert.equal(field('content_bytes').value, '128')
  assert.match(field('content_format').value, /代码围栏/)
  assert.match(field('reason').value, /代码围栏包裹/)
  assert.equal(field('refusal_present').value, '否')
  assert.equal(field('reasoning_content_present').value, '是')
  assert.doesNotMatch(JSON.stringify(rows), /private-/)
})

test('JSON mode request errors explain the missing prompt instruction without exposing upstream text', () => {
  const rows = articleDiagnosticRows({ provider_error_category: 'json_mode_prompt_missing', provider_error_type: 'invalid_request_error', http_status: 400, message: 'Bearer private-key', param: 'private-param' })
  assert.equal(rows.find(row => row.key === 'provider_error_category').value, 'JSON 模式要求提示词明确包含 JSON 字样')
  assert.equal(rows.find(row => row.key === 'http_status').value, '400')
  assert.doesNotMatch(JSON.stringify(rows), /private-/)
})

test('evidence ranges use UTF-8 source bytes and never highlight forged or split quotes', async () => {
  const { evidenceExcerpt, evidenceReasonLabel } = await import('./threatIntel.js')
  const body = '恶意 DNS\n192[.]0[.]2[.]1\n正常 DNS'
  const quote = '192[.]0[.]2[.]1'
  const start = new TextEncoder().encode('恶意 DNS\n').length
  const span = { start, end: start + quote.length, quote }
  assert.deepEqual(evidenceExcerpt(body, span), { before: '恶意 DNS\n', quote, after: '\n正常 DNS' })
  assert.equal(evidenceExcerpt(body, { ...span, quote: 'invented' }), null)
  assert.equal(evidenceExcerpt(body, { start: 1, end: 3, quote: '恶' }), null)
  assert.equal(evidenceExcerpt(body, { ...span, end: 999 }), null)
  assert.equal(evidenceReasonLabel('__proto__'), '原文证据未通过校验')
})

test('AI payload separates protocol, reasoning effort and output budget from timeout', () => {
  const payload = settingsPayload({ ai_enabled: true, ai_endpoint: 'https://ai.example/v1/responses', ai_model: 'model', ai_protocol: 'responses', ai_max_output_tokens: '16000', ai_reasoning_effort: 'low', ai_timeout_seconds: 300 })
  assert.equal(payload.ai_protocol, 'responses'); assert.equal(payload.ai_max_output_tokens, 16000)
  assert.equal(payload.ai_reasoning_effort, 'low'); assert.equal(payload.ai_timeout_seconds, 300)
  const rows = articleDiagnosticRows({ input_tokens: 10589, output_tokens: 8000, reasoning_tokens: 8000, raw_reasoning: 'PRIVATE', actor_candidate_count: 0 })
  assert.equal(rows.find(row => row.key === 'reasoning_tokens').value, '8000')
  assert.equal(rows.find(row => row.key === 'actor_candidate_count').value, '0')
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE/)
  const maximum = settingsPayload({ ai_max_output_tokens: 393216, ai_reasoning_effort: 'max' })
  assert.equal(maximum.ai_max_output_tokens, 393216)
  assert.equal(maximum.ai_reasoning_effort, 'max')
})

test('source request configuration keeps secret values, preservation flags and wildcard rules', () => {
  const form = { ...newSource(), kind: 'article', transport: 'manual', publisher_id: 'legacy', request_config: { proxy_mode: 'custom', proxy_url: '', proxy_configured: true, headers: [{ name: ' Cookie ', value: '', configured: true }, { name: 'User-Agent', value: ' Fixture/1.0 ', configured: false }] } }
  const payload = sourcePayload(form, '*.example.com\n*')
  assert.deepEqual(payload.allowed_hosts, ['*.example.com', '*'])
  assert.equal('publisher_id' in payload, false)
  assert.equal(payload.request_config.proxy_configured, true)
  assert.deepEqual(payload.request_config.headers[0], { name: 'Cookie', value: '', configured: true })
  assert.equal(payload.request_config.headers[1].value, ' Fixture/1.0 ')
  form.request_config.headers.splice(0, 1)
  form.request_config.proxy_mode = 'direct'
  const updated = sourcePayload(form, '*')
  assert.equal(updated.request_config.proxy_url, '')
  assert.equal(updated.request_config.proxy_configured, false)
  assert.equal(updated.request_config.headers.length, 1)
  form.kind = 'json'; form.transport = 'upload'
  assert.equal('request_config' in sourcePayload(form, ''), false)
})
