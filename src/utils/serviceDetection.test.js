import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeEvidence, serviceLabel, supportsRequiredServices } from './serviceDetection.js'
test('explicit native services exclude legacy and partially capable nodes', () => {
  assert.equal(supportsRequiredServices({}, []), true)
  assert.equal(supportsRequiredServices({}, ['dns']), false)
  const node = { scan_capabilities: { service_protocols: ['dns'] } }
  assert.equal(supportsRequiredServices(node, ['dns']), true)
  assert.equal(supportsRequiredServices(node, ['dns', 'vnc']), false)
})
test('native evidence excludes truncated and unknown schemas', () => {
  const item = { module: 'vnc', result: { protocol_version: '003.008' } }
  assert.equal(nativeEvidence({schema_version: 99, evidence: [item]}).length, 0)
  assert.equal(nativeEvidence({schema_version: 2, evidence: [{...item, truncated: true}]}).length, 0)
  assert.deepEqual(nativeEvidence({schema_version: 2, evidence: [item]}), [item])
  assert.equal(serviceLabel('dns'), 'DNS')
  assert.equal(serviceLabel('ssh'), 'ssh')
})
