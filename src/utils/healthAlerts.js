import { tr } from '../i18n/index.js'
export const healthAlertTypes = [
  { value: 'slow_request', get label() { return tr("慢请求") }, service: 'Web API' },
  { value: 'server_error', get label() { return tr("服务端错误") }, service: 'Web API' },
  { value: 'slow_sql', get label() { return tr("慢 SQL") }, service: 'PostgreSQL' },
  { value: 'slow_elasticsearch_query', get label() { return tr("ES 慢查询") }, service: 'Elasticsearch' },
  { value: 'slow_elasticsearch_write', get label() { return tr("ES 慢写入") }, service: 'Elasticsearch' },
  { value: 'elasticsearch_query_error', get label() { return tr("ES 查询错误") }, service: 'Elasticsearch' },
  { value: 'elasticsearch_write_error', get label() { return tr("ES 写入错误") }, service: 'Elasticsearch' },
  { value: 'elasticsearch_error', get label() { return tr("ES 其他错误") }, service: 'Elasticsearch' },
]

export function alertTypeLabel(value) {
  return healthAlertTypes.find((type) => type.value === value)?.label || value || tr("未知类型")
}

export function alertService(value) {
  return healthAlertTypes.find((type) => type.value === value)?.service || tr("其他服务")
}

export function severityLabel(value) {
  return { get warning() { return tr("警告") }, get critical() { return tr("严重") } }[value] || value || tr("未知级别")
}

export function severityClass(value) {
  return { warning: 'badge-warning', critical: 'badge-error' }[value] || 'badge-ghost'
}

function displayValue(value) {
  if (value == null || value === '') return '--'
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
}

export function detailItems(item) {
  const details = item?.detail?.details
  if (!Array.isArray(details)) return []
  return details.filter((entry) => entry && typeof entry.label === 'string').map((entry) => ({
    label: entry.label,
    value: displayValue(entry.value),
  }))
}

export function detailValue(item, label) {
  return detailItems(item).find((entry) => entry.label === label)?.value || ''
}

const policyLabels = ['命中规则', '警告阈值', '严重阈值', '冷却时间', '配置版本']

export function policyItems(item) {
  const policy = item?.detail?.policy
  // Old records can contain only the human-readable rule fields.
  if (!policy || typeof policy !== 'object') {
    return detailItems(item).filter((entry) => policyLabels.includes(entry.label))
  }
  const rows = [
    { get label() { return tr("命中规则") }, value: displayValue(policy.source) },
    { get label() { return tr("配置版本") }, value: displayValue(policy.revision) },
  ]
  if (policy.rule && typeof policy.rule === 'object') {
    const rule = policy.rule
    rows.push(
      { get label() { return tr("检测开关") }, value: rule.enabled == null ? '--' : rule.enabled ? '开启' : '关闭' },
      { get label() { return tr("警告阈值") }, value: rule.warning_threshold_ms == null ? '--' : `${rule.warning_threshold_ms} ms` },
      { get label() { return tr("严重阈值") }, value: rule.critical_threshold_ms == null ? '未启用' : `${rule.critical_threshold_ms} ms` },
      { get label() { return tr("冷却时间") }, value: rule.cooldown_seconds == null ? '--' : `${rule.cooldown_seconds} 秒` },
    )
  }
  return rows
}

export function diagnosticItems(item) {
  return detailItems(item).filter((entry) => !policyLabels.includes(entry.label))
}

export function alertHighlights(item) {
  const labels = item.alert_type === 'slow_sql'
    ? ['本周期平均耗时', '本周期调用次数', '历史峰值耗时']
    : alertService(item.alert_type) === 'Elasticsearch'
      ? ['服务端总耗时', 'HTTP 状态', '失败分片']
      : ['耗时', '状态码', '来源 IP']
  return labels.map((label) => ({ label, value: detailValue(item, label) })).filter((entry) => entry.value)
}

export function alertSubject(item) {
  const path = detailValue(item, '请求路径')
  if (path) return `${detailValue(item, '请求方法')} ${path}`.trim()
  return detailValue(item, '操作') || item.alert_key || tr("未记录告警对象")
}

export function requestLogTarget(item) {
  const path = detailValue(item, '请求路径')
  if (!path || path === '--') return null
  return { path: '/requests', query: { path, method: detailValue(item, '请求方法'), window: '' } }
}

export function alertGuidance(item) {
  if (item.alert_type === 'slow_sql') return {
    get explanation() { return tr("慢 SQL 按采样周期内的平均执行耗时判定；历史峰值不是本次单条 SQL 的耗时。SQL 文本由服务端最多记录 2000 个字符。") },
    steps: ['结合本周期调用次数、总耗时和返回行数，判断查询频率与单次执行成本。', '检查执行计划、索引及锁等待；共享块读取和临时块读写可辅助定位 I/O 或排序开销。'],
  }
  if (item.alert_type === 'slow_request') return {
    get explanation() { return tr("记录一次超过生效阈值的 Web 请求，耗时包含应用处理及其依赖调用。") },
    steps: ['使用请求 ID 关联请求日志和服务端日志，确认慢请求发生的环节。', '对比同路径请求的耗时，检查数据库、Elasticsearch 和外部依赖的响应情况。'],
  }
  if (item.alert_type === 'server_error') return {
    get explanation() { return tr("记录返回 5xx 状态码的请求；错误告警不要求请求耗时超过慢请求阈值。") },
    steps: ['按请求 ID 和发生时间查询服务端错误日志，确认异常堆栈与具体错误原因。', '检查对应接口的依赖可用性、资源用量及最近配置或发布变更。'],
  }
  if (alertService(item.alert_type) === 'Elasticsearch') return {
    get explanation() { return tr("服务端总耗时包含应用与 Elasticsearch 通信；took 是 Elasticsearch 报告的处理耗时，应用额外耗时为两者差值（最小为 0）。无 took 时无法计算差值。") },
    steps: ['使用 Trace ID 关联服务端日志，结合 HTTP 状态、超时标识及失败类型确认异常。', '检查集群健康、失败分片与线程池压力；比较总耗时与 took，排查查询、写入或网络开销。'],
  }
  return { get explanation() { return tr("该类型暂无专用说明，可使用完整详情和告警标识关联服务端日志。") }, steps: ['结合发生时间、告警标识和原始记录排查对应服务。'] }
}
