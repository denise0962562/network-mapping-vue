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

test('requires a dot-separated domain instead of accepting a single label', () => {
  assert.equal(parseScanTargets('a').valid, false)
  assert.equal(parseScanTargets('localhost').valid, false)
  assert.equal(parseScanTargets('a.example').valid, true)
})

test('enforces RFC 1035 label and wire-name octet limits', () => {
  const label63 = 'a'.repeat(63)
  const maximumDomain = `${label63}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`
  const oversizedDomain = `${label63}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`

  assert.equal(parseScanTargets(`${label63}.example`).valid, true)
  assert.equal(parseScanTargets(`${'a'.repeat(64)}.example`).valid, false)
  assert.equal(maximumDomain.length, 253)
  assert.equal(parseScanTargets(maximumDomain).valid, true)
  assert.equal(parseScanTargets(oversizedDomain).valid, false)
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
    'api..example.com',
    'api_example.com'
  ]) {
    assert.equal(parseScanTargets(value).valid, false, value)
  }
})
