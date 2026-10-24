import { i18n } from '../i18n/index.js'
i18n.global.locale.value = 'zh-CN'
import assert from 'node:assert/strict'
import { canVerify, selectPage, discoveryReason } from './domainDiscovery.js'
const candidates = [ { name: 'api.example.com', relation: 'subdomain' }, { name: '*.example.com', relation: 'wildcard' }, { name: 'private.example.com', relation: 'subdomain' }, { name: 'existing.example.com', relation: 'subdomain' }, { name: 'other.test', relation: 'certificate_related' } ]
const excluded = ['private.example.com'], submitted = [{ domain: 'existing.example.com' }]
assert.equal(canVerify(candidates[1], excluded, submitted), false)
assert.equal(canVerify(candidates[2], excluded, submitted), false)
assert.equal(canVerify(candidates[3], excluded, submitted), false)
assert.deepEqual(selectPage(['api.example.com'], candidates, excluded, submitted), ['api.example.com', 'other.test'])
assert.equal(selectPage([], Array.from({ length: 600 }, (_, i) => ({ name: `x${i}.example.com`, relation: 'subdomain' })), [], []).length, 500)
assert.match(discoveryReason('domain_excluded'), /排除/)
assert.ok(!discoveryReason('raw-upstream-secret').includes('raw-upstream-secret'))
