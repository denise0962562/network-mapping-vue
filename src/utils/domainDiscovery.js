import { tr } from '../i18n/index.js'
export const relationLabels = { get seed() { return tr("种子域") }, get subdomain() { return tr("子域名") }, get certificate_related() { return tr("同证书关联") }, get wildcard() { return tr("证书通配模式") } }
export const discoveryStatuses = { get pending() { return tr("排队中") }, get running() { return tr("发现中") }, get succeeded() { return tr("已完成") }, get partial() { return tr("部分结果") }, get failed() { return tr("失败") }, get cancelled() { return tr("已取消") } }
export const discoveryErrors = {
  get invalid_seed() { return tr("请输入完整域名，不含协议、端口或通配符。") }, get discovery_unavailable() { return tr("发现服务暂不可用，请检查 Elasticsearch 和服务状态。") },
  get discovery_not_ready() { return tr("发现尚未完成，请稍后查看。") }, get discovery_not_found() { return tr("发现记录不存在或无权访问。") },
  get discovery_rate_limited() { return tr("发现请求过于频繁或队列已满，请稍后重试。") }, get source_unavailable() { return tr("crt.sh 暂时不可用，系统将按作业策略重试。") },
  get source_transport() { return tr("无法连接 crt.sh。") }, get source_status() { return tr("crt.sh 返回异常状态。") }, get source_rate_limited() { return tr("crt.sh 限流。") }, get source_read() { return tr("crt.sh 响应读取失败。") },
  get source_timeout() { return tr("crt.sh 查询超时。") }, get source_too_large() { return tr("crt.sh 响应超过大小上限。") }, get source_invalid_json() { return tr("crt.sh 返回无效数据。") },
  get evidence_storage() { return tr("发现证据保存失败，将重试。") }, get attempts_exhausted() { return tr("已达到最大重试次数。") },
  get domain_excluded() { return tr("选中目标已命中 DNS 排除规则，请刷新后重新选择。") }, get dns_scanner_unavailable() { return tr("没有可执行 DNS 的扫描器，请先启用扫描器的 DNS 能力。") },
  get select_1_to_500_domains() { return tr("每次请选择 1–500 个域名。") }, get domain_not_in_discovery() { return tr("选中域名不属于本次发现结果。") },
}
export function discoveryReason(code) { return discoveryErrors[code] || tr("操作失败，请稍后重试。") }
export function canVerify(candidate, excluded = [], submitted = []) {
  return candidate.relation !== 'wildcard' && !excluded.includes(candidate.name) && !submitted.some(item => item.domain === candidate.name)
}
export function selectPage(current, candidates, excluded, submitted) {
  return [...new Set([...current, ...candidates.filter(c => canVerify(c, excluded, submitted)).map(c => c.name)])].slice(0, 500)
}
