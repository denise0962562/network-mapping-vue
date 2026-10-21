import test from 'node:test'
import assert from 'node:assert/strict'
import { articleIocLocations, reportReviewItems } from './intelReportReview.js'
import { evidenceExcerpt } from './threatIntel.js'

test('all report IOCs are checked independently against defanged original text and return exact UTF-8 locations', () => {
  const body = '恶意 DNS\n192[.]0[.]2[.]1\nDNS：Bad[.]Example\n下载 hxxps[://]Bad[.]Example/CasePath\nAS 64500\n2001:0db8:0:0:0:0:0:1\n[2001:db8::1]:443\n' + 'AB'.repeat(32)
  const records = [
    { id: 'ip', type: 'ip', value: '192.0.2.1' },
    { id: 'domain', type: 'domain', value: 'bad.example' },
    { id: 'url', type: 'url', value: 'https://bad.example/CasePath' },
    { id: 'asn', type: 'asn', value: 'AS64500' },
    { id: 'v6', type: 'ip', value: '2001:db8::1' },
    { id: 'endpoint', type: 'ip_port', value: '[2001:db8::1]:443' },
    { id: 'hash', type: 'sha256', value: 'ab'.repeat(32) },
  ]
  const locations = articleIocLocations(body, records)
  assert.equal(locations.size, records.length)
  for (const record of records) assert.ok(evidenceExcerpt(body, locations.get(record.id)), record.id)
  assert.equal(locations.get('ip').quote, '192[.]0[.]2[.]1')
  assert.equal(locations.get('url').quote, 'hxxps[://]Bad[.]Example/CasePath')
})

test('a longer IP, subdomain, different URL path case or forged evidence cannot satisfy the original-text check', () => {
  const body = '192.0.2.10 sub.bad.example https://bad.example/casepath ' + 'a'.repeat(65)
  const records = [
    { id: 'ip', type: 'ip', value: '192.0.2.1' },
    { id: 'domain', type: 'domain', value: 'bad.example' },
    { id: 'url', type: 'url', value: 'https://bad.example/CasePath' },
    { id: 'hash', type: 'sha256', value: 'a'.repeat(64) },
    { id: 'missing', type: 'ip', value: '198.51.100.2', payload: { evidence_spans: [{ kind: 'ioc', start: 0, end: 12, quote: '198.51.100.2' }] } },
  ]
  const locations = articleIocLocations(body, records)
  assert.equal(locations.has('domain'), true) // The complete host also appears in the URL.
  for (const id of ['ip', 'url', 'hash', 'missing']) assert.equal(locations.has(id), false, id)
  assert.equal(articleIocLocations('sub.bad.example', [records[1]]).size, 0)
  assert.equal(articleIocLocations('', records).size, 0)
  assert.equal(articleIocLocations('恶意域名bad[.]example已失效', [records[1]]).size, 1)
})

test('batch review submits only pending selected versions and attribution only on approval', () => {
  const records = ['a', 'b', 'c', 'd'].map(id => ({ id, status: id === 'd' ? 'approved' : 'pending', content_hash: `hash-${id}` }))
  assert.deepEqual(reportReviewItems(records, { a: 'approved', b: 'rejected', c: '', d: 'approved' }, { a: { action: 'unassigned' }, b: { action: 'create', name: 'ignored' } }), [
    { id: 'a', content_hash: 'hash-a', decision: 'approved', attribution: { action: 'unassigned' } },
    { id: 'b', content_hash: 'hash-b', decision: 'rejected' },
  ])
})
