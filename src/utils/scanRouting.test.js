import { i18n } from '../i18n/index.js'
i18n.global.locale.value = 'zh-CN'
import test from 'node:test'
import assert from 'node:assert/strict'
import { routingLocation, routingReason, routingSummary } from './scanRouting.js'
test('missing geography and queued placement remain understandable', () => {
  assert.equal(routingLocation(null), '地域未知')
  assert.equal(routingSummary({ reason: 'no_idle_candidate', candidates: [] }), '等待空闲兼容扫描器')
  assert.equal(routingReason('future_reason'), '综合分配')
})
test('explanation uses the selected candidate rather than the first candidate', () => {
  const summary = routingSummary({ preferred_scanner_id: 'b', candidates: [{ scanner_id: 'a', name: '节点 A' }, { scanner_id: 'b', name: '节点 B', reasons: ['same_region', 'idle'] }] })
  assert.equal(summary, '节点 B · 同地区、当前空闲')
})
test('fallback explains the actual assignee rather than an expired preference', () => {
  assert.equal(routingSummary({ preferred_scanner_id: 'a', assigned_scanner_id: 'b', assigned_scanner_name: '节点 B', reason: 'ordinary_claim', candidates: [{ scanner_id: 'a', name: '节点 A' }] }), '节点 B · 由兼容节点领取')
})
