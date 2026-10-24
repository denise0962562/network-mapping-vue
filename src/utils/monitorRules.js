import { tr } from '../i18n/index.js'
export const monitorServices = [
  { key: 'web_api', label: 'Web API' },
  { key: 'postgresql', label: 'PostgreSQL' },
  { key: 'elasticsearch_query', get label() { return tr("ES 查询") } },
  { key: 'elasticsearch_write', get label() { return tr("ES 写入") } },
]

export const scannerHealthDefaults = {
  offline_after_seconds: 90,
  alert_after_seconds: 90,
  check_interval_seconds: 30,
  maintenance_grace_seconds: 90,
  latency_warning_ms: 100,
  latency_critical_ms: 300,
  latency_stale_after_seconds: 90,
}

export function clonePolicy(value) {
  return JSON.parse(JSON.stringify(value))
}

export function normalizeMonitor(document) {
  const result = clonePolicy(document)
  const legacy = {
    web_api: [document.slow_request_threshold_ms ?? 3000, null],
    postgresql: [document.slow_sql_threshold_ms ?? 3000, null],
    elasticsearch_query: [document.elasticsearch_query_warning_threshold_ms ?? 1000, document.elasticsearch_query_critical_threshold_ms ?? 3000],
    elasticsearch_write: [document.elasticsearch_write_warning_threshold_ms ?? 5000, document.elasticsearch_write_critical_threshold_ms ?? 15000],
  }
  result.service_defaults = Object.fromEntries(monitorServices.map(({ key }) => [key, {
    enabled: true,
    warning_threshold_ms: legacy[key][0],
    critical_threshold_ms: legacy[key][1],
    cooldown_seconds: document.alert_cooldown_seconds ?? 300,
    ...document.service_defaults?.[key],
  }]))
  result.slow_request_threshold_ms = result.service_defaults.web_api.warning_threshold_ms
  result.slow_sql_threshold_ms = result.service_defaults.postgresql.warning_threshold_ms
  result.elasticsearch_query_warning_threshold_ms = result.service_defaults.elasticsearch_query.warning_threshold_ms
  result.elasticsearch_query_critical_threshold_ms = result.service_defaults.elasticsearch_query.critical_threshold_ms ?? result.service_defaults.elasticsearch_query.warning_threshold_ms
  result.elasticsearch_write_warning_threshold_ms = result.service_defaults.elasticsearch_write.warning_threshold_ms
  result.elasticsearch_write_critical_threshold_ms = result.service_defaults.elasticsearch_write.critical_threshold_ms ?? result.service_defaults.elasticsearch_write.warning_threshold_ms
  result.operation_rules = clonePolicy(document.operation_rules || [])
  return result
}

export function operationKey(item) {
  return `${item.service}:${item.operation}`
}

export function effectiveRule(document, operation) {
  const override = document.operation_rules?.find((item) => operationKey(item) === operationKey(operation))
  return {
    mode: override ? 'override' : 'inherit',
    rule: override?.rule || document.service_defaults?.[operation.service],
  }
}

export function describeRule(rule) {
  if (!rule) return tr("无规则")
  return tr("{0} · 警告 {1} ms · 严重 {2} · 冷却 {3} 秒", [rule.enabled ? '开启' : '关闭', rule.warning_threshold_ms, rule.critical_threshold_ms == null ? '未启用' : `${rule.critical_threshold_ms} ms`, rule.cooldown_seconds])
}

export function validateSlowRule(rule) {
  if (!Number.isInteger(rule.warning_threshold_ms) || rule.warning_threshold_ms < 1 || rule.warning_threshold_ms > 86400000) return tr("警告阈值必须为 1～86400000 毫秒的整数")
  if (rule.critical_threshold_ms != null && (!Number.isInteger(rule.critical_threshold_ms) || rule.critical_threshold_ms < rule.warning_threshold_ms || rule.critical_threshold_ms > 86400000)) return tr("严重阈值必须不小于警告阈值且不超过 86400000 毫秒")
  if (!Number.isInteger(rule.cooldown_seconds) || rule.cooldown_seconds < 1 || rule.cooldown_seconds > 604800) return tr("冷却时间必须为 1～604800 秒的整数")
  if (typeof rule.enabled !== 'boolean') return tr("检测开关无效")
  return ''
}

export function validateMonitor(document, catalogue) {
  for (const { key, label } of monitorServices) {
    const error = validateSlowRule(document.service_defaults[key])
    if (error) return tr("{0}默认规则：{1}", [label, error])
  }
  const operations = new Set(catalogue.map(operationKey))
  const seen = new Set()
  if (document.operation_rules.length > 512) return tr("操作覆盖不能超过 512 条")
  for (const item of document.operation_rules) {
    const key = operationKey(item)
    if (!operations.has(key)) return tr("操作不在当前目录中：{0}", [item.operation])
    if (seen.has(key)) return tr("操作覆盖重复：{0}", [item.operation])
    seen.add(key)
    const error = validateSlowRule(item.rule)
    if (error) return `${item.operation}：${error}`
  }
  if (!Number.isInteger(document.slow_sql_check_interval_seconds) || document.slow_sql_check_interval_seconds < 1 || document.slow_sql_check_interval_seconds > 86400) return tr("慢 SQL 检查间隔必须为 1～86400 秒的整数")
  if (!Number.isInteger(document.alert_cooldown_seconds) || document.alert_cooldown_seconds < 1 || document.alert_cooldown_seconds > 604800) return tr("错误告警冷却时间必须为 1～604800 秒的整数")
  return ''
}

export function validateScannerHealth(document) {
  if (!Number.isInteger(document.offline_after_seconds) || document.offline_after_seconds < 60 || document.offline_after_seconds > 86400) return tr("在线判定时间必须为 60～86400 秒")
  if (!Number.isInteger(document.alert_after_seconds) || document.alert_after_seconds < document.offline_after_seconds || document.alert_after_seconds > 604800) return tr("掉线告警时间必须不小于在线判定时间且不超过 604800 秒")
  if (!Number.isInteger(document.check_interval_seconds) || document.check_interval_seconds < 1 || document.check_interval_seconds > Math.min(300, document.offline_after_seconds)) return tr("检查间隔必须为 1～300 秒且不超过在线判定时间")
  if (!Number.isInteger(document.maintenance_grace_seconds) || document.maintenance_grace_seconds < 0 || document.maintenance_grace_seconds > 86400) return tr("维护结束宽限期必须为 0～86400 秒")
  if (!Number.isInteger(document.latency_warning_ms) || document.latency_warning_ms < 1 || document.latency_warning_ms > 86400000 || !Number.isInteger(document.latency_critical_ms) || document.latency_critical_ms < document.latency_warning_ms || document.latency_critical_ms > 86400000) return tr("延迟严重阈值必须不小于警告阈值，且两者必须为 1～86400000 毫秒")
  if (!Number.isInteger(document.latency_stale_after_seconds) || document.latency_stale_after_seconds < 1 || document.latency_stale_after_seconds > 86400) return tr("延迟样本过期时间必须为 1～86400 秒")
  return ''
}

export const scannerHealthFields = [
  { key: 'offline_after_seconds', get label() { return tr("在线判定时间") }, get unit() { return tr("秒") }, min: 60, max: 86400, get description() { return tr("超过此时间无心跳则显示离线，并退出自动任务的可用扫描器范围。") } },
  { key: 'alert_after_seconds', get label() { return tr("掉线告警时间") }, get unit() { return tr("秒") }, min: 60, max: 604800, get description() { return tr("从最后一次心跳计算；不得小于在线判定时间。") } },
  { key: 'check_interval_seconds', get label() { return tr("掉线检查间隔") }, get unit() { return tr("秒") }, min: 1, max: 300, get description() { return tr("通知触发还会受到检查周期及邮件投递耗时影响。") } },
  { key: 'maintenance_grace_seconds', get label() { return tr("维护结束宽限期") }, get unit() { return tr("秒") }, min: 0, max: 86400, get description() { return tr("退出维护后暂停掉线检查，等待扫描器恢复连接。") } },
  { key: 'latency_warning_ms', get label() { return tr("通信延迟警告阈值") }, unit: 'ms', min: 1, max: 86400000, get description() { return tr("控制扫描器列表和详情的延迟警告标识。") } },
  { key: 'latency_critical_ms', get label() { return tr("通信延迟严重阈值") }, unit: 'ms', min: 1, max: 86400000, get description() { return tr("达到此耗时显示严重标识；不得小于警告阈值。") } },
  { key: 'latency_stale_after_seconds', get label() { return tr("延迟样本过期时间") }, get unit() { return tr("秒") }, min: 1, max: 86400, get description() { return tr("过期样本显示为灰色，不继续判定延迟级别。") } },
]

export function policyDiff(namespace, before, after, catalogue = []) {
  if (!before) return []
  const rows = []
  const add = (label, oldValue, newValue, effect = tr("直接修改")) => {
    if (oldValue !== newValue) rows.push({ label, before: oldValue, after: newValue, effect })
  }
  if (namespace === 'scanner_health') {
    for (const { key, label, unit } of scannerHealthFields) add(label, `${before[key]} ${unit}`, `${after[key]} ${unit}`)
    return rows
  }
  for (const [key, label] of [['enabled', '健康监控总开关'], ['server_error_enabled', '5xx 告警']]) add(label, before[key] ? tr("开启") : tr("关闭"), after[key] ? tr("开启") : tr("关闭"))
  for (const [key, label] of [['alert_cooldown_seconds', '错误告警冷却时间'], ['slow_sql_check_interval_seconds', 'SQL 检查间隔']]) add(label, tr("{0} 秒", [before[key]]), tr("{0} 秒", [after[key]]))
  for (const { key, label } of monitorServices) add(tr("{0}默认规则", [label]), describeRule(before.service_defaults[key]), describeRule(after.service_defaults[key]))
  // Include old rules that disappeared from the current catalogue so rollback or
  // removal never hides an affected operation from the review.
  const operations = new Map([...catalogue, ...before.operation_rules, ...after.operation_rules].map((item) => [operationKey(item), item]))
  for (const operation of operations.values()) {
    const oldRule = effectiveRule(before, operation)
    const newRule = effectiveRule(after, operation)
    const prefix = (value) => value.mode === 'override' ? tr("覆盖") : tr("继承")
    const label = catalogue.find((item) => operationKey(item) === operationKey(operation))?.label || operation.operation
    add(`${label} · ${operation.operation}`, `${prefix(oldRule)}：${describeRule(oldRule.rule)}`, `${prefix(newRule)}：${describeRule(newRule.rule)}`,
      oldRule.mode === 'inherit' && newRule.mode === 'inherit' ? tr("默认规则影响") : newRule.mode === 'inherit' ? tr("恢复继承") : oldRule.mode === 'inherit' ? tr("新增覆盖") : tr("修改覆盖"))
  }
  return rows
}
