import assert from 'node:assert/strict'
import test from 'node:test'
import { browserLocale, COOKIE_MAX_AGE, localeCookie, preferredLocale, readLocaleCookie } from './locale.js'

test('the first browser preference determines Chinese or English; other languages default to English', () => {
  for (const language of ['zh', 'zh-CN', 'zh-Hant-TW', 'ZH-hk']) assert.equal(browserLocale({ language }), 'zh-CN')
  for (const language of ['en', 'en-GB', 'fr-FR', 'ja', '', 'zhfake']) assert.equal(browserLocale({ language }), 'en')
  assert.equal(browserLocale({ languages: ['de-DE', 'zh-CN'], language: 'zh-CN' }), 'en')
  assert.equal(browserLocale({ languages: ['zh-TW', 'en'] }), 'zh-CN')
  assert.equal(browserLocale({}), 'en')
})

test('only valid manual cookies override browser language, including malformed/hostile values', () => {
  assert.equal(preferredLocale('csrf_token=unchanged; network_mapping_locale=en', { language: 'zh-CN' }), 'en')
  assert.equal(preferredLocale('network_mapping_locale=zh-CN', { language: 'de-DE' }), 'zh-CN')
  for (const value of ['fr', 'en-US', '%E0%A4%A', 'en%3BPath%3D%2F', '%3Cscript%3E', '']) {
    assert.equal(readLocaleCookie(`network_mapping_locale=${value}`), null)
    assert.equal(preferredLocale(`network_mapping_locale=${value}`, { language: 'zh-CN' }), 'zh-CN')
  }
  assert.equal(readLocaleCookie('other_network_mapping_locale=en'), null)
})

test('manual preferences are host-only, year-long and protected for the current transport', () => {
  assert.equal(COOKIE_MAX_AGE, 31536000)
  assert.equal(localeCookie('en', 'https:'), 'network_mapping_locale=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure')
  assert.equal(localeCookie('zh-CN', 'http:'), 'network_mapping_locale=zh-CN; Path=/; Max-Age=31536000; SameSite=Lax')
  assert.throws(() => localeCookie('en; Domain=example.com'), RangeError)
  assert.doesNotMatch(localeCookie('en'), /Domain=/)
})
