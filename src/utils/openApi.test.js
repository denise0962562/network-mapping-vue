import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { apiError, cloneDocument, curlExample, endpointPath, isMutation, samplePayload } from './openApi.js'
import { reactive } from 'vue'

test('application and approval forms can copy reactive policy documents', () => {
  const policy = reactive({ scopes: ['assets:read'], quotas: { requests: 10 } })
  const draft = cloneDocument(policy)
  draft.scopes.push('tasks:read')
  draft.quotas.requests = 20
  assert.deepEqual([...policy.scopes], ['assets:read'])
  assert.equal(policy.quotas.requests, 10)
})
test('IPv6 path values stay literal in JSON debugging and are encoded in HTTP URLs', () => {
  assert.equal(endpointPath('/assets/{ip}', { ip: '2001:db8::1' }), '/assets/2001:db8::1')
  assert.equal(endpointPath('/assets/{ip}', { ip: '2001:db8::1' }, true), '/assets/2001%3Adb8%3A%3A1')
})

test('preserves step-up and request correlation without exposing arbitrary response data', () => {
  assert.deepEqual(apiError({ response: { data: { error: { code: 'step_up_required', message: '重新验证' }, request_id: 'id', password: 'private' } } }), { code: 'step_up_required', message: '重新验证', requestId: 'id' })
  assert.equal(apiError({ response: { data: { message: '旧接口错误' } } }).message, '旧接口错误')
})

test('curl examples quote shell metacharacters as literal arguments', async () => {
  const payload = { value: "x' $(printf BAD) `printf BAD`\ny" }
  const command = curlExample('https://mapping.example.com', 'PUT', '/assets/192.0.2.1/annotations/note', payload)
  // Replace only the executable with an argument dumper; no request is sent.
  const { stdout } = await promisify(execFile)('bash', ['-c', `function curl() { printf '%s\\0' "$@"; }; ${command}`], { encoding: 'utf8' })
  const output = stdout.split('\0')
  assert.equal(output[output.indexOf('--data') + 1], JSON.stringify(payload))
  assert.ok(output.includes('Authorization: Bearer YOUR_API_KEY'))
})

test('GET examples encode array and time query parameters', () => {
  const example = curlExample('https://mapping.example.com', 'GET', '/assets/192.0.2.1/ports', { fields: ['ip', 'port'], start_at: '2026-10-01T00:00:00+08:00' })
  assert.ok(example.includes('fields=ip%2Cport'))
  assert.ok(example.includes('%2B08%3A00'))
  assert.ok(!example.includes('--data'))
})

test('read-only POST queries do not require mutation confirmation', () => {
  for (const path of ['/assets/search', '/tasks/validate', '/analytics/statistics/query', '/vulnerabilities/summary']) assert.equal(isMutation('POST', path), false)
  for (const path of ['/tasks', '/exports', '/reports', '/webhooks', '/tasks/id/cancel']) assert.equal(isMutation('POST', path), true)
})

test('examples respect report and refresh contracts', () => {
  const report = samplePayload('/reports', 'POST')
  assert.ok(report.start_at && report.end_at)
  assert.ok(!('query' in report))
  assert.ok(!('targets' in samplePayload('/assets/{ip}/refresh', 'POST')))
  assert.deepEqual(samplePayload('/analytics/distribution', 'POST'), { data_type: 'port', group_by: 'port' })
})
