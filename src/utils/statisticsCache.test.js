import assert from 'node:assert/strict'
import test from 'node:test'
import { cacheDefaults, cacheFields, validateCache } from './statisticsCache.js'

test('cache defaults and every supported boundary are valid', () => {
  assert.equal(validateCache(cacheDefaults), '')
  for (const field of cacheFields) {
    for (const value of [field.min, field.max]) assert.equal(validateCache({ ...cacheDefaults, [field.key]: value }), '')
    for (const value of [field.min - 1, field.max + 1, 1.5, NaN, String(field.min), null]) assert.notEqual(validateCache({ ...cacheDefaults, [field.key]: value }), '')
  }
  assert.equal(validateCache({ ...cacheDefaults, enabled: false }), '')
  assert.notEqual(validateCache({ ...cacheDefaults, enabled: 'false' }), '')
})
