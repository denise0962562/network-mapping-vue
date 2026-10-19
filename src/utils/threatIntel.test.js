import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultIntervals, newSource, sourcePayload, safeReference, originLabel } from './threatIntel.js'

test('trusted defaults expose configurable source intervals', () => {
  const source = newSource()
  assert.equal(source.require_review, false)
  assert.equal(defaultIntervals.mitre_stix, 86400)
  assert.equal(defaultIntervals.threatfox, 1800)
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
