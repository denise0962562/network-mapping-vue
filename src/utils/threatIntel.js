export const sourceKinds = {
  mitre_stix: 'MITRE STIX 2.1', eset_github: 'ESET / GitHub IOC 仓库',
  threatfox: 'ThreatFox API（增量更新）', threatfox_export: 'ThreatFox 离线 JSON / CSV / ZIP',
  rss: 'RSS 文章（AI 补充）', json: '结构化 JSON IOC', lines: '文本 / CSV IOC',
}
export const defaultIntervals = { mitre_stix: 86400, eset_github: 3600, threatfox: 1800, threatfox_export: 3600, rss: 1800, json: 1800, lines: 1800 }
export const states = { queued: '等待处理', running: '处理中', succeeded: '成功', partial: '分批继续', failed: '失败', cancelled: '已取消', proposed: '已生成待审提议', pending: '待审核', approved: '已接纳', expired: '已过期', revoked: '已撤销', rejected: '已拒绝', superseded: '已被新版本替代', downloaded: '已上传，等待校验', ready: '分批入库', complete: '导入完成' }
const errors = {
  intel_admin_required: '只有管理员可以管理情报来源和审核。',
  intel_revision_conflict: '数据已有变化，请刷新后重新操作。',
  intel_credential_missing: '请保存数据库凭据，或配置所引用的环境变量。',
  intel_invalid_credential: '凭据不能仅包含空白、控制字符或超过 8192 字节；替换与清除不能同时选择。',
  intel_credential_crypto_failed: '凭据加密或解密失败，请检查服务端加密主密钥；不会自动回退到其他凭据。',
  intel_ai_disabled: 'AI 提取已关闭；可信 IOC 同步不受影响。',
  intel_invalid_ai_settings: '请填写模型名称，并检查凭据环境变量名称。',
  intel_invalid_source: '请检查来源名称、格式和检查周期。',
  intel_invalid_hosts: '允许的域名须逐项填写完整小写域名，不支持通配符。',
  intel_url_not_allowed: '远程来源必须使用 HTTPS，且域名须在允许列表中。',
  intel_source_transport: '远程来源连接失败，请检查网络访问及代理配置。',
  intel_source_http_status: '远程来源返回错误，请检查地址与凭据。',
  intel_source_rate_limited: '上游限流，稍后将按配置周期再次检查。',
  intel_local_root_unavailable: '本地 IOC 根目录不可用，请检查服务端 NM_INTEL_LOCAL_ROOT。',
  intel_local_file_unavailable: '本地数据文件不可读取，请检查相对路径和文件权限。',
  intel_local_path_escape: '本地路径超出了 IOC 根目录。',
  intel_source_disabled: '来源已停用，请先启用。',
  intel_source_changed: '来源配置已变化，旧文章任务已取消；请重新同步来源。',
  intel_invalid_upload_source: '请选择离线上传来源和支持的 JSON / CSV 格式。',
  intel_offline_export_required: 'ThreatFox 导出文件只用于离线上传或本地导入；增量更新请选择 ThreatFox API。',
  intel_import_file_required: '请先上传离线文件，再继续导入。',
  intel_import_too_large: '文件超过导入限制：上传 512 MiB、解压或规范化内容 2 GiB、单条 1 MiB。',
  intel_import_cache_unavailable: '导入缓存目录不可写，请检查服务端 NM_INTEL_CACHE_ROOT。',
  intel_import_cache_missing: '导入缓存文件已丢失，请重新上传原始文件。',
  intel_no_supported_indicators: '文件中没有支持的 IOC，请检查数据格式。',
  intel_ai_evidence_not_found: 'AI 输出缺少可定位的 IOC 原文证据，未纳入有效库。',
  intel_unknown_actor: '请选择基准库中类型匹配的有效 MITRE 实体。',
  intel_private_address_forbidden: '远程抓取不能访问私网或本机地址。',
  intel_not_found: '记录不存在。', intel_storage_unavailable: '情报存储暂时不可用。',
}
export function intelError(error) {
  const code = typeof error === 'string' ? error : error?.response?.data?.code
  return errors[code] || (code ? `操作未完成（${code}）。` : '情报请求失败，请稍后重试。')
}
export function originLabel(record) { return record?.origin === 'ai' ? (record.status === 'pending' ? 'AI · 待审' : 'AI · 人工审核') : record?.status === 'pending' ? '结构化来源 · 待审' : record?.review_id ? '结构化来源 · 人工审核' : '可信结构化来源' }
export function newSource() { return { name: '', kind: 'json', transport: 'https', location: '', allowed_hosts: [], auth_env: '', credential: '', clear_credential: false, enabled: true, require_review: false, interval_seconds: 1800, expiry_months: 6 } }
export function sourcePayload(form, hostsText) {
  const { name, kind, transport, location, auth_env, enabled, require_review, interval_seconds, revision } = form
  const value = { name: name.trim(), kind, transport, location: transport === 'upload' ? '' : location.trim(), auth_env: transport !== 'https' ? '' : auth_env.trim(), enabled, require_review, interval_seconds: Number(interval_seconds), expiry_months: Number(form.expiry_months ?? 6), allowed_hosts: transport !== 'https' && kind !== 'rss' ? [] : hostsText.split(/[\s,]+/).filter(Boolean) }
  if (revision != null) value.expected_revision = revision
  if (transport === 'https') writeCredential(value, form)
  return value
}
function writeCredential(payload, form) {
  if (form.clear_credential) payload.clear_credential = true
  else if (form.credential) payload.credential = form.credential
}
export function settingsPayload(form) {
  const { ai_enabled, ai_endpoint, ai_model, ai_key_env } = form
  const value = { ai_enabled, ai_endpoint, ai_model, ai_key_env: (ai_key_env || '').trim() }
  writeCredential(value, form)
  return value
}
export function safeReference(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null } catch { return null }
}
