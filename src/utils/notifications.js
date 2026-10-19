export const notificationEvents = [
  { value: 'health.alert', label: '健康告警' },
  { value: 'scanner.offline', label: 'Scanner 掉线' },
  { value: 'scanner.recovered', label: 'Scanner 恢复' },
  { value: 'user.login', label: '用户登录' },
  { value: 'report.weekly', label: '周报生成' },
  { value: 'report.monthly', label: '月报生成' },
]

export const notificationProviders = [{ value: 'email', label: '邮件' }, { value: 'feishu', label: '飞书' }, { value: 'telegram', label: 'Telegram' }]
export function providerLabel(value) { return notificationProviders.find(item => item.value === value)?.label || value }

export const deliveryStatuses = {
  pending: '等待投递', sending: '投递中', sent: '发送成功', failed: '发送失败', cancelled: '已取消',
}

const reasons = {
  provider_rejected: '服务商拒绝请求，请检查渠道凭据、目标和服务商访问限制',
  provider_temporarily_unavailable: '服务商暂时不可用或触发限流',
  network_or_tls_error: '网络或 TLS 连接失败', response_read_failed: '读取服务商响应失败',
  delivery_timeout: '投递超时', invalid_destination: 'Webhook 地址无效',
  secret_unavailable: '无法解密渠道凭据，请联系管理员检查服务密钥',
  signing_failed: '签名计算失败', payload_too_large: '消息超过飞书长度限制',
  invalid_payload: '消息格式无效', response_too_large: '飞书响应超过限制',
  channel_changed: '渠道已修改，旧投递已取消', channel_deleted: '渠道已删除',
  scanner_recovered: 'Scanner 已恢复，取消掉线通知', scanner_deactivated: 'Scanner 已停用',
  channel_or_incident_changed: '渠道订阅或 Scanner 状态已变化',
  event_expired: '事件超过 24 小时，已取消投递', attempts_exhausted: '已达到最大尝试次数',
  smtp_delivery_failed: 'SMTP 投递失败，请检查服务器、密钥及收件人',
  proxy_invalid: '代理配置无效，请重新保存渠道', proxy_authentication_failed: '代理认证失败，请检查代理用户名和密码',
  proxy_connection_failed: '无法连接代理服务器', proxy_connect_rejected: '代理拒绝连接目标服务',
  proxy_invalid_response: '代理返回无效响应', proxy_dns_failed: '代理连接前的目标域名解析失败',
  proxy_tls_error: '代理服务器 TLS 验证失败', smtp_tls_error: 'SMTP 服务器 TLS 验证失败',
  smtp_permanent_error: 'SMTP 服务器永久拒绝邮件', smtp_client_error: 'SMTP 认证或请求配置无效',

  no_recipients: '没有有效收件人，请配置邮箱或渠道收件人',
  notification_source_unavailable: '通知数据暂不可用，将重试',
  mail_template_disabled: '对应邮件模板已停用', report_unavailable: '归档报告邮件不可用',
  notification_template_invalid: '通知模板渲染失败或消息超出平台限制，请检查对应渠道的已发布模板',
}

export function deliveryReason(value) { return reasons[value] || (value ? '投递异常，请检查服务状态' : '—') }
export function eventLabel(value) {
  return value === 'notification.test' ? '测试通知' : notificationEvents.find((item) => item.value === value)?.label || value
}
export function channelForm(channel) {
  return {
    id: channel?.id || null, provider: channel?.provider || 'feishu', name: channel?.name || '', enabled: channel?.enabled ?? true,
    event_types: [...(channel?.event_types || notificationEvents.map((item) => item.value))],
    minimum_severity: channel?.minimum_severity || 'warning', webhook_url: '', signing_secret: '',
    clear_signing_secret: false, expected_revision: channel?.revision ?? null,
    signing_secret_configured: channel?.signing_secret_configured || false,
    credential_configured: channel?.credential_configured || false,
    bot_token: '', smtp_password: '',
    proxy_mode: channel?.proxy_mode || 'system', proxy_url: '',
    proxy_configured: Boolean(channel?.proxy_configured), proxy_endpoint: channel?.proxy_endpoint || '',

    settings: { smtp_host: channel?.settings?.smtp_host || '', smtp_port: channel?.settings?.smtp_port || 465,
      smtp_sender: channel?.settings?.smtp_sender || '', chat_id: channel?.settings?.chat_id || '',
      recipients: [...(channel?.settings?.recipients || [])] },
    recipients_text: (channel?.settings?.recipients || []).join('\n'),
  }
}
export function channelPayload(form) {
  return {
    provider: form.provider, name: form.name.trim(), enabled: Boolean(form.enabled), event_types: [...form.event_types],
    minimum_severity: form.minimum_severity, webhook_url: form.webhook_url.trim(),
    signing_secret: form.signing_secret.trim(), clear_signing_secret: Boolean(form.clear_signing_secret),
    expected_revision: form.expected_revision,
    bot_token: form.provider === 'telegram' ? form.bot_token.trim() : '',
    smtp_password: form.provider === 'email' ? form.smtp_password : '',
    proxy_mode: form.proxy_mode, proxy_url: form.proxy_mode === 'custom' ? form.proxy_url.trim() : '',

    settings: { ...form.settings, smtp_host: form.settings.smtp_host.trim(), smtp_sender: form.settings.smtp_sender.trim(),
      smtp_port: Number(form.settings.smtp_port), chat_id: form.settings.chat_id.trim(),
      recipients: [...new Set(form.recipients_text.split(/[\n,;]+/).map(value => value.trim()).filter(Boolean))] },
  }
}
export function validateChannel(form) {
  if (!['system', 'direct', 'custom'].includes(form.proxy_mode)) return '请选择有效的代理模式。'
  if (form.proxy_mode === 'custom' && (form.proxy_url || !form.proxy_configured)) {
    try {
      const value = form.proxy_url.trim(), url = new URL(value)
      if (value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value) || !['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol)
        || !url.hostname || (url.protocol.startsWith('socks') && (url.username || url.password) && (!url.username || !url.password)) || (url.port === '0') || (url.protocol.startsWith('socks') && !url.port)
        || !['', '/'].includes(url.pathname) || url.search || url.hash) throw new Error()
      for (const credential of [url.username, url.password]) {
        const decoded = decodeURIComponent(credential)
        if (new TextEncoder().encode(decoded).length > 255 || /[\u0000-\u001f\u007f]/.test(decoded)) throw new Error()
      }
    } catch { return '请输入完整 HTTP、HTTPS、SOCKS5 或 SOCKS5H 代理地址，不含路径、查询或片段。' }
  }

  if (!form.name.trim() || [...form.name.trim()].length > 80) return '请输入 1 至 80 个字符的渠道名称。'
  if (!form.event_types.length) return '请至少选择一种通知事件。'
  if (form.provider === 'email') {
    const s = channelPayload(form).settings
    if (!s.smtp_host || s.smtp_host.length > 253 || /[\s/\\:@?#]/.test(s.smtp_host)) return '请输入 SMTP 服务器域名。'
    if (!Number.isInteger(s.smtp_port) || s.smtp_port < 1 || s.smtp_port > 65535) return 'SMTP 端口须在 1 至 65535 之间。'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.smtp_sender)) return '请输入有效的发件人邮箱。'
    if ((!form.id || !form.credential_configured) && !form.smtp_password) return '首次配置须填写发件邮箱密钥。'
    if (s.recipients.length > 32 || s.recipients.some(value => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) return '请填写有效的收件人邮箱，最多 32 个。'
    return ''
  }
  if (form.provider === 'telegram') {
    if ((!form.id || form.bot_token.trim()) && !/^\d{1,20}:[A-Za-z0-9_-]{20,128}$/.test(form.bot_token.trim())) return '请输入有效的 Telegram Bot Token。'
    const chat = form.settings.chat_id.trim()
    if (!/^-?[1-9]\d{0,18}$/.test(chat) && !/^@[A-Za-z0-9_]{5,32}$/.test(chat)) return '请输入数字 Chat ID 或公开频道 @名称。'
    return ''
  }
  if (form.provider !== 'feishu') return '请选择支持的通知渠道类型。'
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
