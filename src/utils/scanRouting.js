export function routingReason(reason) {
  return ({ same_region: '同地区', same_country: '同国家或地区', other_region: '其他地区', geo_unknown: '地域未知',
    measured_target_quality: '目标连接质量较好', execution_history: '参考同类执行历史', recent_route_failure: '近期存在路由故障',
    busy: '正在执行任务', idle: '当前空闲', ranked_candidate: '已选择兼容扫描器', user_selected: '用户指定扫描器', ordinary_claim: '由兼容节点领取', no_idle_candidate: '等待空闲兼容扫描器', preference_expired: '优先领取已到期，其他兼容节点可领取' })[reason] || '综合分配'
}
export function routingLocation(geo) {
  return [geo?.country_code, geo?.region, geo?.city].filter(Boolean).join(' · ') || '地域未知'
}
export function routingSummary(decision) {
  if (!decision) return '等待分配'
  const selected = decision.candidates?.find((c) => c.scanner_id === (decision.assigned_scanner_id || decision.preferred_scanner_id))
  if (decision.assigned_scanner_id && decision.reason !== 'ranked_candidate') {
    return `${decision.assigned_scanner_name || selected?.name || decision.assigned_scanner_id} · ${routingReason(decision.reason)}`
  }
  if (!selected) return decision.assigned_scanner_id ? `${decision.assigned_scanner_name || decision.assigned_scanner_id} · ${routingReason(decision.reason)}` : routingReason(decision.reason)
  return `${selected.name || selected.scanner_id} · ${(selected.reasons || []).map(routingReason).join('、')}`
}
