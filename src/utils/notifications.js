export const notificationEvents = [
  { value: 'health.alert', label: '健康告警' },
  { value: 'scanner.offline', label: 'Scanner 掉线' },
  { value: 'scanner.recovered', label: 'Scanner 恢复' },
]

export const deliveryStatuses = {
  pending: '等待投递', sending: '投递中', sent: '发送成功', failed: '发送失败', cancelled: '已取消',
}

const reasons = {
  provider_rejected: '飞书拒绝请求，请检查签名、关键词及 IP 白名单',
  provider_temporarily_unavailable: '飞书暂时不可用或触发限流',
  network_or_tls_error: '网络或 TLS 连接失败', response_read_failed: '读取飞书响应失败',
  delivery_timeout: '投递超时', invalid_destination: 'Webhook 地址无效',
  secret_unavailable: '无法解密渠道凭据，请联系管理员检查服务密钥',
  signing_failed: '签名计算失败', payload_too_large: '消息超过飞书长度限制',
  invalid_payload: '消息格式无效', response_too_large: '飞书响应超过限制',
  channel_changed: '渠道已修改，旧投递已取消', channel_deleted: '渠道已删除',
  scanner_recovered: 'Scanner 已恢复，取消掉线通知', scanner_deactivated: 'Scanner 已停用',
  channel_or_incident_changed: '渠道订阅或 Scanner 状态已变化',
  event_expired: '事件超过 24 小时，已取消投递', attempts_exhausted: '已达到最大尝试次数',
}

export function deliveryReason(value) { return reasons[value] || (value ? '投递异常，请检查服务状态' : '—') }
export function eventLabel(value) {
  return value === 'notification.test' ? '测试通知' : notificationEvents.find((item) => item.value === value)?.label || value
}
export function channelForm(channel) {
  return {
    id: channel?.id || null, name: channel?.name || '', enabled: channel?.enabled ?? true,
    event_types: [...(channel?.event_types || notificationEvents.map((item) => item.value))],
    minimum_severity: channel?.minimum_severity || 'warning', webhook_url: '', signing_secret: '',
    clear_signing_secret: false, expected_revision: channel?.revision ?? null,
    signing_secret_configured: channel?.signing_secret_configured || false,
  }
}
export function channelPayload(form) {
  return {
    name: form.name.trim(), enabled: Boolean(form.enabled), event_types: [...form.event_types],
    minimum_severity: form.minimum_severity, webhook_url: form.webhook_url.trim(),
    signing_secret: form.signing_secret.trim(), clear_signing_secret: Boolean(form.clear_signing_secret),
    expected_revision: form.expected_revision,
  }
}
export function validateChannel(form) {
  if (!form.name.trim() || [...form.name.trim()].length > 80) return '请输入 1 至 80 个字符的渠道名称。'
  if (!form.event_types.length) return '请至少选择一种通知事件。'
  if (!form.id || form.webhook_url.trim()) {
    try {
      const url = new URL(form.webhook_url.trim())
      if (url.protocol !== 'https:' || url.hostname !== 'open.feishu.cn' || (url.port && url.port !== '443')
        || url.username || url.password || url.search || url.hash
        || !/^\/open-apis\/bot\/v2\/hook\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.pathname)) throw new Error()
    } catch { return '请输入飞书自定义机器人的完整 HTTPS Webhook 地址。' }
  }
  if (form.clear_signing_secret && form.signing_secret.trim()) return '请在填写新密钥和清除旧密钥之间选择一项。'
  return ''
}
