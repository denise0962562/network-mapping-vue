import { i18n } from '../i18n/index.js'
i18n.global.locale.value = 'zh-CN'
import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveRule, normalizeMonitor, policyDiff, scannerHealthDefaults, validateMonitor, validateScannerHealth } from './monitorRules.js'

const operation = { service: 'elasticsearch_query', operation: 'asset-search', label: '资产搜索' }
const catalogue = [operation, { ...operation, operation: 'scan-query', label: '扫描结果查询' }]
const legacy = { enabled: true, server_error_enabled: true, slow_sql_check_interval_seconds: 60, alert_cooldown_seconds: 300 }

test('old documents retain thresholds and inherit changes unless explicitly overridden', () => {
  const document = normalizeMonitor({ ...legacy, slow_request_threshold_ms: 4500 })
  assert.equal(document.service_defaults.web_api.warning_threshold_ms, 4500)
  assert.equal(document.service_defaults.web_api.critical_threshold_ms, null)
  const independent = structuredClone(document.service_defaults.elasticsearch_query)
  document.operation_rules.push({ ...operation, rule: independent })
  document.service_defaults.elasticsearch_query.warning_threshold_ms = 1500
  assert.equal(effectiveRule(document, operation).rule.warning_threshold_ms, 1000)
  assert.equal(effectiveRule(document, catalogue[1]).rule.warning_threshold_ms, 1500)
  document.operation_rules = []
  assert.equal(effectiveRule(document, operation).mode, 'inherit')
  assert.equal(effectiveRule(document, operation).rule.warning_threshold_ms, 1500)
})

test('preview includes default changes and their inherited effects', () => {
  const before = normalizeMonitor(legacy)
  const after = structuredClone(before)
  after.service_defaults.elasticsearch_query.warning_threshold_ms = 1500
  const rows = policyDiff('monitor', before, after, catalogue)
  assert.equal(rows.length, 3)
  assert.equal(rows.filter((row) => row.effect === '默认规则影响').length, 2)
  assert.match(rows[1].after, /1500 ms/)
})

test('preview distinguishes a new override from restored inheritance even for identical values', () => {
  const before = normalizeMonitor(legacy)
  const after = structuredClone(before)
  after.operation_rules.push({ ...operation, rule: structuredClone(before.service_defaults.elasticsearch_query) })
  assert.equal(policyDiff('monitor', before, after, catalogue)[0].effect, '新增覆盖')
  assert.equal(policyDiff('monitor', after, before, catalogue)[0].effect, '恢复继承')
})

test('invalid severity relationships, duplicate operations and missing catalogue are rejected', () => {
  const document = normalizeMonitor(legacy)
  assert.equal(validateMonitor(document, catalogue), '')
  document.operation_rules.push({ ...operation, rule: { ...document.service_defaults.elasticsearch_query, enabled: false } })
  assert.equal(validateMonitor(document, catalogue), '')
  assert.match(validateMonitor(document, []), /不在当前目录/)
  document.operation_rules.push(structuredClone(document.operation_rules[0]))
  assert.match(validateMonitor(document, catalogue), /重复/)
  document.operation_rules.pop()
  document.operation_rules[0].rule.critical_threshold_ms = 500
  assert.match(validateMonitor(document, catalogue), /严重阈值/)
})

test('scanner online and alert times must preserve their ordering', () => {
  assert.equal(validateScannerHealth(scannerHealthDefaults), '')
  assert.match(validateScannerHealth({ ...scannerHealthDefaults, alert_after_seconds: 89 }), /不小于在线/)
  assert.match(validateScannerHealth({ ...scannerHealthDefaults, check_interval_seconds: 91 }), /检查间隔/)
  const rows = policyDiff('scanner_health', scannerHealthDefaults, { ...scannerHealthDefaults, alert_after_seconds: 180 })
  assert.deepEqual(rows, [{ label: '掉线告警时间', before: '90 秒', after: '180 秒', effect: '直接修改' }])
})
