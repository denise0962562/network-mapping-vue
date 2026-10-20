export const sourceKinds = {
  mitre_stix: 'MITRE STIX 2.1', eset_github: 'ESET / GitHub IOC 仓库',
  threatfox: 'ThreatFox API（增量更新）', threatfox_export: 'ThreatFox 离线 JSON / CSV / ZIP',
  article: '手动文章 / 微信正文（AI 补充）', rss: 'RSS 文章（AI 补充）', json: '结构化 JSON IOC', lines: '文本 / CSV IOC',
}
export const defaultIntervals = { mitre_stix: 86400, eset_github: 3600, threatfox: 1800, threatfox_export: 3600, rss: 1800, article: 1800, json: 1800, lines: 1800 }
export const states = { queued: '等待处理', running: '处理中', succeeded: '成功', partial: '分批继续', failed: '失败', cancelled: '已取消', proposed: '已生成待审提议', pending: '待审核', approved: '已接纳', expired: '已过期', revoked: '已撤销', rejected: '已拒绝', superseded: '已被新版本替代', downloaded: '已上传，等待校验', ready: '分批入库', complete: '导入完成' }
export const attackTypes = { bgp_hijacking: 'BGP 路由劫持', route_leak: '路由泄漏', dns_hijacking: 'DNS 劫持', dns_response_tampering: 'DNS 应答篡改', malicious_redirection: '恶意重定向', phishing: '钓鱼', malware_delivery: '恶意软件投递', command_and_control: '命令与控制', credential_theft: '凭据窃取', data_exfiltration: '数据外传', denial_of_service: '拒绝服务', reconnaissance: '侦察' }
export const iocRoles = { route_hijacker: '路由劫持基础设施', malicious_dns: '恶意 DNS 服务', redirect_destination: '恶意重定向目的地址', c2: '命令与控制端点', payload_host: '载荷托管地址', phishing_host: '钓鱼地址' }
export function attackLabel(value) { return attackTypes[value] || value }
export function roleLabel(value) { return iocRoles[value] || value }
export function articleIntakeLabel(metadata) {
  const intake = metadata?.intake
  if (intake?.publisher_verification === 'administrator_supplied') return '管理员提供的正文快照，尚未核验网络发布账号'
  if (intake?.publisher_verification === 'page_account_match') return '已核对微信页面发布账号'
  return intake?.method === 'remote_pending' ? '等待远程抓取正文' : '远程文章正文'
}
const errors = {
  intel_invalid_asn: 'ASN 格式无效，请填写 AS 加十进制编号或纯编号；不支持网段或 AS 路径。',
  intel_invalid_classification: '攻击行为或指标角色不在支持列表中，请使用分类选项并保留原文证据。',
  intel_invalid_article_source: '请选择手动文章来源，获取方式须为手动提交且不配置来源地址或凭据。',
  intel_article_submission_required: '该来源通过文章页手动提交，不执行周期同步。',
  intel_invalid_article: '请填写文章标题和有效正文；正文可留空远程抓取，手动正文须为 40～100,000 UTF-8 字节。',
  intel_invalid_article_url: '请提供有效的微信公众号文章地址或白名单内的 HTTPS 文章。',
  intel_article_publisher_required: '远程抓取微信文章前，请在来源中绑定账号 __biz；也可手动粘贴正文，随后由人工审核 AI 提议。',
  intel_article_publisher_mismatch: '文章发布账号与来源绑定账号不一致或无法核对，未进行 AI 提取；请检查账号或手动提交正文。',
  intel_invalid_publisher: '微信账号 __biz 格式无效，请填写账号标识，不是公众号昵称。',
  intel_article_body_missing: '没有取得有效文章正文，可能是验证页面或不支持的结构；可在文章页手动提交正文快照。',
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
  intel_dns_failed: '来源域名解析失败，请检查服务器或容器的 DNS；使用代理时确认 HTTPS_PROXY / ALL_PROXY 与 NO_PROXY 配置。',
  intel_proxy_dns_failed: '代理服务器域名解析失败，请检查代理地址及服务器或容器的 DNS。',
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
  intel_import_busy: '该来源已有排队或运行中的作业，请等待完成后再上传。',
  intel_import_read_failed: '上传中断或长时间未收到数据，请检查网络后重试。',
  intel_import_write_failed: '导入缓存写入失败，请检查磁盘空间与缓存目录权限。',
  intel_import_too_large: '文件超过导入限制：上传 512 MiB、解压或规范化内容 2 GiB、单条 1 MiB。',
  intel_import_cache_unavailable: '服务端导入缓存不可用：请在后端进程设置 NM_INTEL_CACHE_ROOT，并让运行后端的账户拥有该目录的读写权限；修改后重启后端。在 pnpm dev 中设置无效。',
  intel_import_cache_missing: '导入缓存文件已丢失，请重新上传原始文件。',
  intel_import_check_failed: '服务端未返回有效的上传准备确认，请检查后端版本、登录状态及代理路由。文件尚未发送。',
  intel_no_supported_indicators: '文件中没有支持的 IOC，请检查数据格式。',
  intel_invalid_csv: 'CSV 格式无法解析：请保留原始表头、逗号分隔及完整引号；支持 ThreatFox 的注释表头、字段空格和 UTF-8 BOM。',
  intel_source_not_utf8: '文件编码不是 UTF-8，请将文件转换为 UTF-8 后重新导入。',
  intel_invalid_ioc_document: 'JSON 结构或内容无效：支持 IOC 数组、data/iocs 数组和 ThreatFox 按 ID 分组的导出；请勿上传错误页或截断文件。',
  intel_invalid_indicator_url: '来源含无法识别的 URL IOC，请检查该条记录的格式；支持 HTTP(S)、FTP(S)、SMB、TFTP、TCP、WS(S) 和无协议的主机/路径。文件尚未通过完整校验时不会入库。',
  intel_invalid_reference: '来源记录的参考链接格式无效；参考链接应为不含账号密码的 HTTP/HTTPS 地址。',
  intel_invalid_domain: '该值无法规范化为域名；支持国际化域名及下划线 DNS 名称，不猜测或解码其他字符串。',
  intel_invalid_ip: '该值不是有效的 IPv4 或 IPv6 地址。',
  intel_invalid_endpoint: '该值不是有效的 IP:端口；端口须在 0–65535 范围，端口 0 只按原值保存，不扩大为整 IP 标记。',
  intel_invalid_hash: '哈希长度或十六进制格式不符合声明的类型。',
  intel_invalid_indicator: '记录的字段类型、长度、置信度或必填内容无效。',
  intel_unsupported_indicator_type: '当前不支持该 IOC 类型，原始类型已保留在异常摘要中。',
  intel_ai_evidence_not_found: 'AI 输出缺少可定位的 IOC 原文证据，未纳入有效库。',
  intel_unknown_actor: '请选择基准库中类型匹配的有效 MITRE 实体。',
  intel_private_address_forbidden: '远程抓取不能访问私网或本机地址。',
  intel_not_found: '记录不存在。', intel_storage_unavailable: '情报存储暂时不可用。',
}
export function intelError(error) {
  const code = typeof error === 'string' ? error : error?.response?.data?.code
  if (errors[code]) return errors[code]
  if (error?.response?.status === 413) return '上传被服务器或反向代理的大小限制拒绝；文件最多 512 MiB，请检查代理上传限制。'
  if ([502, 504].includes(error?.response?.status)) return '反向代理连接服务器失败或等待超时，请检查服务状态；上传是否已接收可在同步作业中确认。'
  if (['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) return '上传请求超时，请检查网络与反向代理超时配置后重试。'
  return code ? `操作未完成（${code}）。` : '情报请求失败，请检查网络与服务器状态后重试。'
}
export function originLabel(record) { return record?.origin === 'ai' ? (record.status === 'pending' ? 'AI · 待审' : 'AI · 人工审核') : record?.status === 'pending' ? '结构化来源 · 待审' : record?.review_id ? '结构化来源 · 人工审核' : '可信结构化来源' }
export function newSource() { return { name: '', kind: 'json', transport: 'https', location: '', allowed_hosts: [], publisher_id: '', auth_env: '', credential: '', clear_credential: false, enabled: true, require_review: false, interval_seconds: 1800, expiry_months: 6 } }
export function sourcePayload(form, hostsText) {
  const { name, kind, transport, location, auth_env, enabled, require_review, interval_seconds, revision } = form
  const value = { name: name.trim(), kind, transport, location: ['upload', 'manual'].includes(transport) ? '' : location.trim(), auth_env: transport !== 'https' ? '' : auth_env.trim(), enabled, require_review, interval_seconds: Number(interval_seconds), expiry_months: Number(form.expiry_months ?? 6), allowed_hosts: transport !== 'https' && !['rss','article'].includes(kind) ? [] : hostsText.split(/[\s,]+/).filter(Boolean) }
  if (form.publisher_id || ['rss', 'article'].includes(kind)) value.publisher_id = (form.publisher_id || '').trim()
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
