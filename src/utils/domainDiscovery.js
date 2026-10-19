export const relationLabels = { seed: '种子域', subdomain: '子域名', certificate_related: '同证书关联', wildcard: '证书通配模式' }
export const discoveryStatuses = { pending: '排队中', running: '发现中', succeeded: '已完成', partial: '部分结果', failed: '失败', cancelled: '已取消' }
export const discoveryErrors = {
  invalid_seed: '请输入完整域名，不含协议、端口或通配符。', discovery_unavailable: '发现服务暂不可用，请检查 Elasticsearch 和服务状态。',
  discovery_not_ready: '发现尚未完成，请稍后查看。', discovery_not_found: '发现记录不存在或无权访问。',
  discovery_rate_limited: '发现请求过于频繁或队列已满，请稍后重试。', source_unavailable: 'crt.sh 暂时不可用，系统将按作业策略重试。',
  source_transport: '无法连接 crt.sh。', source_status: 'crt.sh 返回异常状态。', source_rate_limited: 'crt.sh 限流。', source_read: 'crt.sh 响应读取失败。',
  source_timeout: 'crt.sh 查询超时。', source_too_large: 'crt.sh 响应超过大小上限。', source_invalid_json: 'crt.sh 返回无效数据。',
  evidence_storage: '发现证据保存失败，将重试。', attempts_exhausted: '已达到最大重试次数。',
  domain_excluded: '选中目标已命中 DNS 排除规则，请刷新后重新选择。', dns_scanner_unavailable: '没有可执行 DNS 的扫描器，请先启用扫描器的 DNS 能力。',
  select_1_to_500_domains: '每次请选择 1–500 个域名。', domain_not_in_discovery: '选中域名不属于本次发现结果。',
}
export function discoveryReason(code) { return discoveryErrors[code] || '操作失败，请稍后重试。' }
export function canVerify(candidate, excluded = [], submitted = []) {
  return candidate.relation !== 'wildcard' && !excluded.includes(candidate.name) && !submitted.some(item => item.domain === candidate.name)
}
export function selectPage(current, candidates, excluded, submitted) {
  return [...new Set([...current, ...candidates.filter(c => canVerify(c, excluded, submitted)).map(c => c.name)])].slice(0, 500)
}
