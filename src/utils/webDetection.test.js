import test from 'node:test'
import assert from 'node:assert/strict'
import { webLabel, webCsvValues, webCsvHeaders } from './webDetection.js'

test('empty, pending, unsupported and partial states remain explicit', () => {
  assert.equal(webLabel(null), '暂无识别结果')
  assert.equal(webLabel({ status: 'pending', technologies: [{ name: 'Old' }] }), '识别中')
  assert.equal(webLabel({ status: 'unsupported' }), '证据格式暂不支持')
  assert.equal(webLabel({ status: 'partial', technologies: [] }), '证据不完整')
  assert.equal(webCsvValues(null, String).length, webCsvHeaders.length)
  assert.equal(webCsvValues({ status: 'pending', technologies: [{ name: 'Old' }] }, String)[0], '')
})

test('conflicting versions are not shown as a confirmed version', () => {
  const web = { status: 'partial', technologies: [{ id: 'jquery', name: 'jQuery', version: '3.7.1', version_conflict: true }], observed_at: 123, stale: true, ruleset_version: 'fixture' }
  assert.equal(webLabel(web), 'jQuery（版本冲突）')
  assert.deepEqual(webCsvValues(web, String), ['jQuery（版本冲突）', 'partial', '123', '是', 'fixture'])
})
