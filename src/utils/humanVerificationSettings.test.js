import { i18n } from '../i18n/index.js'
i18n.global.locale.value = 'zh-CN'
import assert from 'node:assert/strict'
import test from 'node:test'
import { settingsForm, settingsPayload, validateSettings } from './humanVerificationSettings.js'

function fixture(provider = 'turnstile', secret = true) {
  return { revision: 7, secret_key_configured: secret, document: {
    provider, site_key: 'public-fixture', allowed_hostnames: ['console.example.com'],
    timeout_ms: 3000, connect_timeout_ms: 1000, max_in_flight: 32, send_remote_ip: false,
  } }
}

test('read model is explicit and never populates a Secret field from response data', () => {
  const data = fixture()
  data.secret_key = 'must-not-be-read'
  data.document.secret_key = 'must-not-be-read'
  const form = settingsForm(data)
  assert.equal(form.secret_key, '')
  assert.equal(form.secret_key_configured, true)
  assert.equal(form.clear_secret, false)
  assert.equal(form.hostnames, 'console.example.com')
  assert.equal(validateSettings(form), '')
  assert.throws(() => settingsForm(null))
  assert.throws(() => settingsForm({ ...data, revision: 0 }))
  assert.throws(() => settingsForm({ ...data, secret_key_configured: undefined }))
})

test('empty Secret explicitly means keep, and update payload excludes local display fields', () => {
  const form = settingsForm(fixture())
  form.hostnames = 'CONSOLE.example.com\nconsole.example.com, login.example.com '
  form.change_reason = '  update allowlist  '
  const payload = settingsPayload(form)
  assert.equal(payload.expected_revision, 7)
  assert.equal(payload.secret_key, '')
  assert.equal(payload.clear_secret, false)
  assert.deepEqual(payload.document.allowed_hostnames, ['console.example.com', 'login.example.com'])
  assert.equal(payload.change_reason, 'update allowlist')
  assert.equal(payload.secret_key_configured, undefined)
  assert.equal(payload.document.revision, undefined)
  assert.equal(payload.document.secret_key, undefined)
})

test('replacing and clearing credentials require distinct intents and cannot remove a live credential', () => {
  const form = settingsForm(fixture())
  form.clear_secret = true
  assert.match(validateSettings(form), /开启 Turnstile/)
  form.provider = 'none'
  assert.equal(settingsPayload(form).clear_secret, true)
  form.secret_key = 'new-private-fixture'
  assert.match(validateSettings(form), /不能同时/)
  form.clear_secret = false
  form.provider = 'turnstile'
  assert.equal(settingsPayload(form).secret_key, 'new-private-fixture')
  const empty = settingsForm(fixture('turnstile', false))
  assert.match(validateSettings(empty), /开启 Turnstile/)
  empty.secret_key = 'first-secret'
  assert.equal(validateSettings(empty), '')
})

test('invalid provider, domains, limits and unprintable secrets cannot be submitted', () => {
  for (const update of [
    { provider: 'unknown' }, { site_key: '' }, { hostnames: '' },
    { hostnames: '*.example.com' }, { hostnames: 'https://console.example.com' },
    { hostnames: 'console.example.com:443' }, { hostnames: 'console.example.com/path' },
    { hostnames: 'x..example.com' }, { hostnames: '例子.example.com' },
    { timeout_ms: 499 }, { timeout_ms: 10001 }, { timeout_ms: '' },
    { connect_timeout_ms: 0 }, { connect_timeout_ms: 3001 },
    { max_in_flight: 0 }, { max_in_flight: 257 }, { max_in_flight: 1.5 },
    { secret_key: 'private-key\n' }, { secret_key: ' private-key' },
  ]) {
    const form = Object.assign(settingsForm(fixture()), update)
    assert.notEqual(validateSettings(form), '', JSON.stringify(Object.keys(update)))
    assert.throws(() => settingsPayload(form))
  }
  assert.equal(validateSettings(settingsForm(fixture('none', false))), '')
})
