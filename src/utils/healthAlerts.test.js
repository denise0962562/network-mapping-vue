import assert from 'node:assert/strict'
import test from 'node:test'
import { alertGuidance, alertHighlights, alertService, alertSubject, alertTypeLabel, detailItems, diagnosticItems, healthAlertTypes, policyItems, requestLogTarget, severityClass, severityLabel } from './healthAlerts.js'

const record = (details, extra = {}) => ({
  alert_type: 'slow_request',
  alert_key: 'slow_request:GET:/api/tasks',
  detail: { details: Object.entries(details).map(([label, value]) => ({ label, value })), ...extra },
})

test('all backend alert types are covered, with neutral fallbacks for unknown values', () => {
  assert.equal(healthAlertTypes.length, 8)
  assert.equal(alertTypeLabel('elasticsearch_error'), 'ES 其他错误')
  assert.equal(alertService('slow_sql'), 'PostgreSQL')
  assert.equal(alertTypeLabel('future_type'), 'future_type')
  assert.equal(alertService('future_type'), '其他服务')
  assert.equal(severityClass('future_severity'), 'badge-ghost')
  assert.equal(severityLabel('future_severity'), 'future_severity')
})

test('missing and malformed historical details are safe; zero and false remain visible', () => {
  for (const item of [{}, { detail: null }, { detail: { details: {} } }]) assert.deepEqual(detailItems(item), [])
  const item = { detail: { details: [null, {}, { label: '失败分片', value: 0 }, { label: '是否超时', value: false }, { label: '空值', value: null }] } }
  assert.deepEqual(detailItems(item), [{ label: '失败分片', value: '0' }, { label: '是否超时', value: 'false' }, { label: '空值', value: '--' }])
})

test('full SQL and trace strings survive normalization without truncation or HTML interpretation', () => {
  const query = 'SELECT <script>alert(1)</script>\n' + '字段'.repeat(1000)
  const item = record({ 查询: query, 'Trace ID': 'trace-123', 未知诊断字段: { reason: 'timeout' } })
  assert.equal(diagnosticItems(item)[0].value, query)
  assert.equal(diagnosticItems(item)[1].value, 'trace-123')
  assert.equal(JSON.parse(diagnosticItems(item)[2].value).reason, 'timeout')
})

test('rule snapshot preserves configuration revision zero and disabled critical threshold', () => {
  const item = record({ 耗时: '3400 ms', 命中规则: '旧展示文本' }, { policy: {
    source: '继承Web API默认', revision: 0,
    rule: { enabled: true, warning_threshold_ms: 3000, critical_threshold_ms: null, cooldown_seconds: 300 },
  } })
  const policy = Object.fromEntries(policyItems(item).map(({ label, value }) => [label, value]))
  assert.equal(policy['命中规则'], '继承Web API默认')
  assert.equal(policy['配置版本'], '0')
  assert.equal(policy['严重阈值'], '未启用')
  assert.equal(policy['冷却时间'], '300 秒')
  assert.deepEqual(diagnosticItems(item), [{ label: '耗时', value: '3400 ms' }])
})

test('older readable rules remain available without inventing missing thresholds', () => {
  assert.deepEqual(policyItems(record({ 命中规则: '继承默认', 警告阈值: '1000 ms', 耗时: '1200 ms' })), [
    { label: '命中规则', value: '继承默认' }, { label: '警告阈值', value: '1000 ms' },
  ])
  assert.deepEqual(policyItems({}), [])
})

test('service-specific metrics keep SQL averages distinct from peaks and include zero failed shards', () => {
  const sql = { ...record({ 本周期平均耗时: '3200 ms', 历史峰值耗时: '8000 ms', 本周期调用次数: 4 }), alert_type: 'slow_sql' }
  assert.deepEqual(alertHighlights(sql).map((entry) => entry.label), ['本周期平均耗时', '本周期调用次数', '历史峰值耗时'])
  assert.match(alertGuidance(sql).explanation, /历史峰值不是本次单条 SQL/)
  const es = { ...record({ 服务端总耗时: '1200 ms', 失败分片: 0 }), alert_type: 'slow_elasticsearch_query' }
  assert.equal(alertHighlights(es)[1].value, '0')
  assert.match(alertGuidance(es).explanation, /无 took 时无法计算差值/)
})

test('request navigation uses supported path and method filters and all-time window', () => {
  const item = record({ 请求方法: 'GET', 请求路径: '/api/tasks', '请求 ID': 'request-123' })
  assert.equal(alertSubject(item), 'GET /api/tasks')
  assert.deepEqual(requestLogTarget(item), { path: '/requests', query: { path: '/api/tasks', method: 'GET', window: '' } })
  assert.equal(requestLogTarget(record({})), null)
  assert.equal(alertSubject(record({ 操作: 'bulk' })), 'bulk')
  assert.match(alertGuidance({ alert_type: 'unknown' }).explanation, /暂无专用说明/)
})
