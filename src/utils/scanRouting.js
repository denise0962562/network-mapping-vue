import { tr } from '../i18n/index.js'
export function routingReason(reason) {
  return ({ get same_region() { return tr("同地区") }, get same_country() { return tr("同国家或地区") }, get other_region() { return tr("其他地区") }, get geo_unknown() { return tr("地域未知") },
    get measured_target_quality() { return tr("目标连接质量较好") }, get execution_history() { return tr("参考同类执行历史") }, get recent_route_failure() { return tr("近期存在路由故障") },
    get busy() { return tr("正在执行任务") }, get idle() { return tr("当前空闲") }, get ranked_candidate() { return tr("已选择兼容扫描器") }, get user_selected() { return tr("用户指定扫描器") }, get ordinary_claim() { return tr("由兼容节点领取") }, get no_idle_candidate() { return tr("等待空闲兼容扫描器") }, get preference_expired() { return tr("优先领取已到期，其他兼容节点可领取") } })[reason] || tr("综合分配")
}
export function routingLocation(geo) {
  return [geo?.country_code, geo?.region, geo?.city].filter(Boolean).join(' · ') || tr("地域未知")
}
export function routingSummary(decision) {
  if (!decision) return tr("等待分配")
  const selected = decision.candidates?.find((c) => c.scanner_id === (decision.assigned_scanner_id || decision.preferred_scanner_id))
  if (decision.assigned_scanner_id && decision.reason !== 'ranked_candidate') {
    return `${decision.assigned_scanner_name || selected?.name || decision.assigned_scanner_id} · ${routingReason(decision.reason)}`
  }
  if (!selected) return decision.assigned_scanner_id ? `${decision.assigned_scanner_name || decision.assigned_scanner_id} · ${routingReason(decision.reason)}` : routingReason(decision.reason)
  return `${selected.name || selected.scanner_id} · ${(selected.reasons || []).map(routingReason).join('、')}`
}
