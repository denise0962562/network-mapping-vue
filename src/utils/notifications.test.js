import assert from 'node:assert/strict'
import { test } from 'node:test'
import { channelForm, channelPayload, validateChannel, deliveryReason } from './notifications.js'

test('editing preserves credentials and copies subscriptions without modifying the channel', () => {
  const original = { id: 'channel', revision: 3, name: '运维', enabled: true, event_types: ['health.alert'], signing_secret_configured: true }
  const form = channelForm(original)
  assert.equal(form.webhook_url, '')
  assert.equal(form.signing_secret, '')
  assert.equal(validateChannel(form), '')
  form.event_types.push('scanner.offline')
  assert.deepEqual(original.event_types, ['health.alert'])
  const payload = channelPayload(form)
  assert.equal(payload.expected_revision, 3)
  assert.equal(payload.signing_secret, '')
  assert.equal('signing_secret_configured' in payload, false)
  assert.equal('id' in payload, false)
})
test('new channels require the fixed Feishu HTTPS endpoint and a subscription', () => {
  const form = channelForm()
  form.name = '运维'
  assert.notEqual(validateChannel(form), '')
  form.webhook_url = 'https://open.feishu.cn/open-apis/bot/v2/hook/00000000-0000-4000-8000-000000000001'
  assert.equal(validateChannel(form), '')
  const good = form.webhook_url
  for (const bad of [good.replace('https:', 'http:'), good.replace('open.feishu.cn', 'evil.example'), `${good}?token=secret`, `${good}#fragment`, good.replace('open.feishu.cn', 'name@open.feishu.cn')]) {
    form.webhook_url = bad
    assert.notEqual(validateChannel(form), '')
  }
  form.webhook_url = good
  form.event_types = []
  assert.notEqual(validateChannel(form), '')
})
test('secret removal is explicit and errors never echo unknown provider text', () => {
  const form = channelForm({ id: 'channel', name: '运维', revision: 1 })
  form.signing_secret = 'replacement'
  form.clear_signing_secret = true
  assert.notEqual(validateChannel(form), '')
  assert.equal(deliveryReason('https://example.invalid/leaked-secret'), '投递异常，请检查服务状态')
})
