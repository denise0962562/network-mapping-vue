import test from 'node:test'
import assert from 'node:assert/strict'
import { parseScanTargets } from './scanTargets.js'

test('accepts comma-separated IPv4 addresses and CIDRs', () => {
  const result = parseScanTargets('192.0.2.1,198.51.100.0/24')
  assert.equal(result.valid, true)
  assert.equal(result.type, 'ipv4')
  assert.equal(result.separator, 'comma')
})

test('accepts newline-separated IPv6 addresses and CIDRs', () => {
  const result = parseScanTargets('2001:db8::1\n2001:db8:1::/48')
  assert.equal(result.valid, true)
  assert.equal(result.type, 'ipv6')
  assert.equal(result.separator, 'newline')
})

test('normalizes domain targets', () => {
  const result = parseScanTargets('API.Example.com.,www.example.com')
  assert.deepEqual(result.targets, ['api.example.com', 'www.example.com'])
  assert.equal(result.type, 'domain')
})

test('rejects mixed separators and target types', () => {
  assert.equal(parseScanTargets('192.0.2.1,\n192.0.2.2').valid, false)
  assert.equal(parseScanTargets('192.0.2.1,example.com').valid, false)
})

test('rejects malformed addresses, prefixes, and domains', () => {
  for (const value of [
    '256.0.0.1',
    '192.0.2.1/33',
    '2001:db8:::1',
    '2001:db8::1/129',
    '-api.example.com',
    'api..example.com'
  ]) {
    assert.equal(parseScanTargets(value).valid, false, value)
  }
})
