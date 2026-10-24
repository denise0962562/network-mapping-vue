import { i18n } from '../i18n/index.js'
i18n.global.locale.value = 'zh-CN'
import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive } from 'vue'
import { availableModels, mergeModels, providerForm, readEvents, settingsPayload, transportForm } from './llm.js'

test('editing a reactive provider preserves saved secret markers without copying the key', () => {
  const original = reactive({ credential: 'should-not-be-copied', transport: { ...transportForm(), headers: [{ name: 'Authorization', value: '', configured: true }] }, models: [{ id: 'a', protocol: 'chat', available: true }] })
  const form = providerForm(original)
  assert.equal(form.credential, '')
  assert.equal(form.transport.headers[0].configured, true)
  form.models[0].id = 'changed'
  assert.equal(original.models[0].id, 'a')
  assert.equal(transportForm().stream, null)
  assert.equal(transportForm(true).stream, false)
})
test('selection is one explicit pair and unsupported models cannot be selected', () => {
  const p = { models: [{ id: 'a', protocol: 'chat', available: true }, { id: 'b', protocol: 'anthropic', available: true }, { id: 'c', protocol: 'responses', available: false }] }
  assert.deepEqual(availableModels(p).map(m => m.id), ['a'])
  const payload = settingsPayload({ revision: 4, enabled: true, provider_id: 'p', model_id: 'a', global: {} }, { enabled: false })
  assert.equal(payload.provider_id, 'p'); assert.equal(payload.model_id, 'a'); assert.equal(payload.expected_revision, 4); assert.equal(payload.enabled, false)
})
test('refresh retains missing models as unavailable for an explicit review', () => {
  const existing = [{ id: 'retired', available: true }]
  assert.deepEqual(mergeModels(existing, [{ id: 'new', available: true }]), [{ id: 'new', available: true }, { id: 'retired', available: false }])
  assert.equal(existing[0].available, true)
})
function body(parts) { return new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } }) }
test('POST SSE handles UTF-8 split across arbitrary network chunks and CRLF', async () => {
  const raw = new TextEncoder().encode('data: {"type":"delta","text":"你好"}\r\n\r\ndata: {"type":"done","text":"你好"}\n\n')
  const events = []
  await readEvents(body([...raw].map(b => Uint8Array.of(b))), e => events.push(e))
  assert.deepEqual(events.map(e => e.text), ['你好', '你好'])
})
test('partial SSE never passes as a completed reply', async () => {
  await assert.rejects(readEvents(body([new TextEncoder().encode('data: {"type":"delta","text":"partial"}\n\n')]), () => {}), /incomplete/)
  const errors = []
  await readEvents(body([new TextEncoder().encode('data: {"type":"error","code":"llm_stream_failed"}\n\n')]), e => errors.push(e))
  assert.equal(errors[0].code, 'llm_stream_failed')
})
