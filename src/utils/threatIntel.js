import { tr } from '../i18n/index.js'
export const sourceKinds = {
  mitre_stix: 'MITRE STIX 2.1', get eset_github() { return tr("ESET / GitHub IOC 仓库") },
  get threatfox() { return tr("ThreatFox API（增量更新）") }, get threatfox_export() { return tr("ThreatFox 离线 JSON / CSV / ZIP") },
  get article() { return tr("手动文章") }, get rss() { return tr("RSS 文章（AI 补充）") }, get json() { return tr("结构化 JSON IOC") }, get lines() { return tr("文本 / CSV IOC") },
}
export const defaultIntervals = { mitre_stix: 86400, eset_github: 3600, threatfox: 1800, threatfox_export: 3600, rss: 1800, article: 1800, json: 1800, lines: 1800 }
export const states = { get queued() { return tr("等待处理") }, get running() { return tr("处理中") }, get succeeded() { return tr("成功") }, get partial() { return tr("分批继续") }, get failed() { return tr("失败") }, get cancelled() { return tr("已取消") }, get proposed() { return tr("已生成待审提议") }, get pending() { return tr("待审核") }, get approved() { return tr("已接纳") }, get expired() { return tr("已过期") }, get revoked() { return tr("已撤销") }, get rejected() { return tr("已拒绝") }, get superseded() { return tr("已被新版本替代") }, get downloaded() { return tr("已上传，等待校验") }, get ready() { return tr("分批入库") }, get paused() { return tr("已暂停，可继续导入") }, get complete() { return tr("导入完成") } }
export const attackTypes = { get bgp_hijacking() { return tr("BGP 路由劫持") }, get route_leak() { return tr("路由泄漏") }, get dns_hijacking() { return tr("DNS 劫持") }, get dns_response_tampering() { return tr("DNS 应答篡改") }, get malicious_redirection() { return tr("恶意重定向") }, get phishing() { return tr("钓鱼") }, get malware_delivery() { return tr("恶意软件投递") }, get command_and_control() { return tr("命令与控制") }, get credential_theft() { return tr("凭据窃取") }, get data_exfiltration() { return tr("数据外传") }, get denial_of_service() { return tr("拒绝服务") }, get reconnaissance() { return tr("侦察") } }
export const iocRoles = { get route_hijacker() { return tr("路由劫持基础设施") }, get malicious_dns() { return tr("恶意 DNS 服务") }, get redirect_destination() { return tr("恶意重定向目的地址") }, get c2() { return tr("命令与控制端点") }, get payload_host() { return tr("载荷托管地址") }, get phishing_host() { return tr("钓鱼地址") } }
export function attackLabel(value) { return attackTypes[value] || value }
export function roleLabel(value) { return iocRoles[value] || value }
export function articleStatusLabel(article) {
  if (!['proposed', 'succeeded'].includes(article.status)) return states[article.status] || article.status
  if (article.pending_count > 0) return tr("待审核（{0} 条）", [article.pending_count])
  if (article.record_count > 0) return tr("提取已完成，无待审提议")
  if (article.record_count === 0) return tr("提取已完成，未生成提议")
  return tr("提取已完成")
}
export function articleIntakeLabel(metadata) {
  const intake = metadata?.intake
  if (intake?.publisher_verification === 'administrator_supplied') return tr("管理员提供的正文快照，尚未核验网络发布账号")
  if (intake?.publisher_verification === 'page_account_match') return tr("已核对微信页面发布账号")
  return intake?.method === 'remote_pending' ? tr("等待远程抓取正文") : tr("远程文章正文")
}
const errors = {
  get intel_invalid_asn() { return tr("ASN 格式无效，请填写 AS 加十进制编号或纯编号；不支持网段或 AS 路径。") },
  get intel_invalid_classification() { return tr("攻击行为或指标角色不在支持列表中，请使用分类选项并保留原文证据。") },
  get intel_invalid_article_source() { return tr("请选择手动文章来源，获取方式须为手动提交且不配置来源地址或凭据。") },
  get intel_article_submission_required() { return tr("该来源通过文章页手动提交，不执行周期同步。") },
  get intel_invalid_article() { return tr("请填写文章标题和有效正文；正文可留空远程抓取，手动正文须为 40～100,000 UTF-8 字节。") },
  get intel_invalid_article_url() { return tr("请提供有效的微信公众号文章地址或白名单内的 HTTPS 文章。") },
  get intel_article_publisher_mismatch() { return tr("文章发布账号与来源绑定账号不一致或无法核对，未进行 AI 提取；请检查账号或手动提交正文。") },
  get intel_article_body_missing() { return tr("没有取得有效文章正文，可能是验证页面或不支持的结构；可在文章页手动提交正文快照。") },
  get intel_admin_required() { return tr("只有管理员可以管理情报来源和审核。") },
  get intel_revision_conflict() { return tr("数据已有变化，请刷新后重新操作。") },
  get intel_credential_missing() { return tr("请保存数据库凭据，或配置所引用的环境变量。") },
  get intel_invalid_credential() { return tr("凭据不能仅包含空白、控制字符或超过 8192 字节；替换与清除不能同时选择。") },
  get intel_credential_crypto_failed() { return tr("凭据加密或解密失败，请检查服务端加密主密钥；不会自动回退到其他凭据。") },
  get intel_ai_disabled() { return tr("AI 提取已关闭；可信 IOC 同步不受影响。") },
  get intel_ai_timeout() { return tr("文章提取超过处理时限，请展开错误详情确认停留阶段后重试。") },
  get intel_ai_invalid_response() { return tr("AI 接口未返回有效的 Chat Completions 响应；当前不支持 Responses 格式，请检查接口地址并展开错误详情。") },
  get intel_ai_invalid_json() { return tr("AI 回复不是有效 JSON，文章正文已保留；请展开错误详情查看回复格式、解析位置与结束原因。") },
  get intel_ai_output_truncated() { return tr("AI 回复达到输出上限，结果未接收；请检查模型的输出限制后重试。") },
  get intel_ai_content_filtered() { return tr("AI 提供方标记回复被内容过滤，未生成提议；请检查接口返回状态。") },
  get intel_ai_refused() { return tr("AI 模型返回拒答，未生成提议；文章正文已保留。") },
  get intel_ai_empty_content() { return tr("AI 接口未返回有效回复文本，文章正文已保留；请检查模型与接口兼容性后重试。") },
  get intel_ai_settings_changed() { return tr("AI 配置已变化，旧响应已停止写入；请按新配置重试文章。") },
  get intel_invalid_ai_settings() { return tr("请填写模型名称，并检查凭据环境变量名称。") },
  get intel_invalid_ai_timeout() { return tr("AI 请求超时须为 1～1800 秒的整数。") },
  get intel_invalid_source() { return tr("请检查来源名称、格式和检查周期。") },
  get intel_invalid_proxy() { return tr("请填写有效的 HTTP、HTTPS、SOCKS5 或 SOCKS5H 代理地址。") },
  get intel_invalid_headers() { return tr("请求头名称和值无效或重复；最多 64 项、合计 32 KiB，不支持 Host、Content-Length 等传输控制头。") },
  get intel_source_redirect_limit() { return tr("远程来源跳转次数过多，请检查来源地址。") },
  get intel_invalid_hosts() { return tr("允许的域名须逐项填写小写域名、*.example.com 或 *（全部域名）。") },
  get intel_url_not_allowed() { return tr("远程来源必须使用 HTTPS，且域名须在允许列表中。") },
  get intel_source_timeout() { return tr("远程原文请求超时，请检查服务器网络与代理。") },
  get intel_ai_transport() { return tr("AI 接口连接失败，文章正文已保留；请检查 AI 接口与后端代理配置，并展开错误详情。") },
  get intel_ai_request_timeout() { return tr("AI 接口请求超时，文章正文已保留；请检查服务连通性与响应速度，或调大 AI 设置中的请求超时。") },
  get intel_ai_dns_failed() { return tr("AI 接口域名解析失败，请检查后端 DNS。") },
  get intel_ai_proxy_dns_failed() { return tr("访问 AI 接口时代理域名解析失败，请检查后端代理配置。") },
  get intel_ai_http_status() { return tr("AI 接口返回错误，请在错误详情查看 HTTP 状态，并检查接口地址、模型和凭据。") },
  get intel_ai_rate_limited() { return tr("AI 接口限流，请稍后重试。") },
  get intel_ai_response_too_large() { return tr("AI 接口响应超过大小限制。") },
  get intel_ai_request_failed() { return tr("AI 接口请求失败，请展开错误详情检查原因。") },
  get intel_source_transport() { return tr("远程来源连接失败，请检查网络访问及代理配置。") },
  get intel_dns_failed() { return tr("来源域名解析失败，请检查服务器或容器的 DNS；使用代理时确认 HTTPS_PROXY / ALL_PROXY 与 NO_PROXY 配置。") },
  get intel_proxy_dns_failed() { return tr("代理服务器域名解析失败，请检查代理地址及服务器或容器的 DNS。") },
  get intel_source_http_status() { return tr("远程来源返回错误，请检查地址与凭据。") },
  get intel_source_rate_limited() { return tr("上游限流，稍后将按配置周期再次检查。") },
  get intel_local_root_unavailable() { return tr("本地 IOC 根目录不可用，请检查服务端 NM_INTEL_LOCAL_ROOT。") },
  get intel_local_file_unavailable() { return tr("本地数据文件不可读取，请检查相对路径和文件权限。") },
  get intel_local_path_escape() { return tr("本地路径超出了 IOC 根目录。") },
  get intel_source_disabled() { return tr("来源已停用，请先启用。") },
  get intel_source_changed() { return tr("来源配置已变化，旧文章任务已取消；请重新同步来源。") },
  get intel_invalid_upload_source() { return tr("请选择离线上传来源和支持的 JSON / CSV 格式。") },
  get intel_offline_export_required() { return tr("ThreatFox 导出文件只用于离线上传或本地导入；增量更新请选择 ThreatFox API。") },
  get intel_import_file_required() { return tr("请先上传离线文件，再继续导入。") },
  get intel_import_paused() { return tr("导入已按批次数上限暂停，请继续导入或使用 CLI --resume。") },
  get intel_import_busy() { return tr("该来源已有排队或运行中的作业，请等待完成后再上传。") },
  get intel_import_read_failed() { return tr("上传中断或长时间未收到数据，请检查网络后重试。") },
  get intel_import_write_failed() { return tr("导入缓存写入失败，请检查磁盘空间与缓存目录权限。") },
  get intel_import_too_large() { return tr("文件超过导入限制：上传 512 MiB、解压或规范化内容 2 GiB、单条 1 MiB。") },
  get intel_import_cache_unavailable() { return tr("服务端导入缓存不可用：请在后端进程设置 NM_INTEL_CACHE_ROOT，并让运行后端的账户拥有该目录的读写权限；修改后重启后端。在 pnpm dev 中设置无效。") },
  get intel_import_cache_missing() { return tr("导入缓存文件已丢失，请重新上传原始文件。") },
  get intel_import_check_failed() { return tr("服务端未返回有效的上传准备确认，请检查后端版本、登录状态及代理路由。文件尚未发送。") },
  get intel_no_supported_indicators() { return tr("文件中没有支持的 IOC，请检查数据格式。") },
  get intel_invalid_csv() { return tr("CSV 格式无法解析：请保留原始表头、逗号分隔及完整引号；支持 ThreatFox 的注释表头、字段空格和 UTF-8 BOM。") },
  get intel_source_not_utf8() { return tr("文件编码不是 UTF-8，请将文件转换为 UTF-8 后重新导入。") },
  get intel_invalid_ioc_document() { return tr("JSON 结构或内容无效：支持 IOC 数组、data/iocs 数组和 ThreatFox 按 ID 分组的导出；请勿上传错误页或截断文件。") },
  get intel_invalid_indicator_url() { return tr("来源含无法识别的 URL IOC，请检查该条记录的格式；支持 HTTP(S)、FTP(S)、SMB、TFTP、TCP、WS(S) 和无协议的主机/路径。文件尚未通过完整校验时不会入库。") },
  get intel_invalid_reference() { return tr("来源记录的参考链接格式无效；参考链接应为不含账号密码的 HTTP/HTTPS 地址。") },
  get intel_invalid_domain() { return tr("该值无法规范化为域名；支持国际化域名及下划线 DNS 名称，不猜测或解码其他字符串。") },
  get intel_invalid_ip() { return tr("该值不是有效的 IPv4 或 IPv6 地址。") },
  get intel_invalid_endpoint() { return tr("该值不是有效的 IP:端口；端口须在 0–65535 范围，端口 0 只按原值保存，不扩大为整 IP 标记。") },
  get intel_invalid_hash() { return tr("哈希长度或十六进制格式不符合声明的类型。") },
  get intel_invalid_indicator() { return tr("记录的字段类型、长度、置信度或必填内容无效。") },
  get intel_unsupported_indicator_type() { return tr("当前不支持该 IOC 类型，原始类型已保留在异常摘要中。") },
  get intel_ai_evidence_not_found() { return tr("AI 提议未通过原文证据校验，请查看具体原因；未纳入有效库。") },
  get intel_unknown_actor() { return tr("请选择基准库中类型匹配的有效 MITRE 实体。") },
  get intel_private_address_forbidden() { return tr("远程抓取不能访问私网或本机地址。") },
  get intel_ai_protocol_mismatch() { return tr("接口地址与所选协议不匹配，请核对 Chat Completions 或 Responses 路径。") },
  get intel_invalid_attribution() { return tr("请核对报告组织原名、处理方式和目标组织。") },
  get intel_actor_name_exists() { return tr("已存在同名组织，请搜索后选择或补充别名。") },
  get intel_not_found() { return tr("记录不存在。") }, get intel_storage_unavailable() { return tr("情报存储暂时不可用。") },
}
export function intelError(error) {
  const code = typeof error === 'string' ? error : error?.response?.data?.code
  if (errors[code]) return errors[code]
  if (error?.response?.status === 413) return tr("上传被服务器或反向代理的大小限制拒绝；文件最多 512 MiB，请检查代理上传限制。")
  if ([502, 504].includes(error?.response?.status)) return tr("反向代理连接服务器失败或等待超时，请检查服务状态；上传是否已接收可在同步作业中确认。")
  if (['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) return tr("上传请求超时，请检查网络与反向代理超时配置后重试。")
  return code ? tr("操作未完成（{0}）。", [code]) : tr("情报请求失败，请检查网络与服务器状态后重试。")
}
export function originLabel(record) { return record?.origin === 'ai' ? (record.status === 'pending' ? tr("AI · 待审") : tr("AI · 人工审核")) : record?.status === 'pending' ? tr("结构化来源 · 待审") : record?.review_id ? tr("结构化来源 · 人工审核") : tr("可信结构化来源") }
export function newSource() { return { name: '', kind: 'json', transport: 'https', location: '', allowed_hosts: [], request_config: { proxy_mode: 'system', proxy_url: '', proxy_configured: false, headers: [] }, auth_env: '', credential: '', clear_credential: false, enabled: true, require_review: false, interval_seconds: 1800, expiry_months: 6 } }
export function sourcePayload(form, hostsText) {
  const { name, kind, transport, location, auth_env, enabled, require_review, interval_seconds, revision } = form
  const value = { name: name.trim(), kind, transport, location: ['upload', 'manual'].includes(transport) ? '' : location.trim(), auth_env: transport !== 'https' ? '' : auth_env.trim(), enabled, require_review, interval_seconds: Number(interval_seconds), expiry_months: Number(form.expiry_months ?? 6), allowed_hosts: transport !== 'https' && !['rss','article'].includes(kind) ? [] : hostsText.split(/[\s,]+/).filter(Boolean) }
  if (transport === 'https' || ['rss', 'article'].includes(kind)) {
    const config = form.request_config || newSource().request_config
    value.request_config = { proxy_mode: config.proxy_mode, proxy_url: config.proxy_mode === 'custom' ? config.proxy_url.trim() : '', proxy_configured: config.proxy_mode === 'custom' && Boolean(config.proxy_configured), headers: config.headers.map(h => ({ name: h.name.trim(), value: h.value, configured: Boolean(h.configured) })) }
  }
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
  const value = { ai_enabled, ai_endpoint, ai_model, ai_key_env: (ai_key_env || '').trim(), ai_timeout_seconds: Number(form.ai_timeout_seconds ?? 180), ai_protocol: form.ai_protocol || 'chat', ai_max_output_tokens: Number(form.ai_max_output_tokens ?? 65536), ai_reasoning_effort: form.ai_reasoning_effort || 'none' }
  writeCredential(value, form)
  return value
}
export function safeReference(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null } catch { return null }
}

const extractionStages = {
  get source_load() { return tr("读取来源配置") }, get article_load() { return tr("读取文章快照") }, get article_fetch() { return tr("抓取远程原文") },
  get article_parse() { return tr("解析文章正文") }, get body_store() { return tr("保存正文快照") }, get ai_settings() { return tr("读取 AI 配置与凭据") },
  get ai_request() { return tr("请求 AI 接口") }, get ai_response() { return tr("解析 AI 响应") }, get ai_validate() { return tr("校验 AI 提议与原文证据") },
  get indicator_store() { return tr("保存 IOC 提议") },
}
const diagnosticFields = {
  get prompt_source() { return tr("提示词来源") }, get prompt_hash() { return tr("提示词 SHA-256") },
  get expected_context_block_id() { return tr("预期上下文标题块") }, get correction_method() { return tr("证据纠正方式") },
  get context_block_id() { return tr("上下文正文块") }, get ioc_block_id() { return tr("IOC 正文块") }, get ioc_scope_block_id() { return tr("IOC 所属标题块") }, get context_block_kind() { return tr("上下文块类型") }, get ioc_block_kind() { return tr("IOC 块类型") },
  get provider_error_category() { return tr("提供方错误分类") }, get provider_error_code() { return tr("提供方错误代码") }, get provider_error_type() { return tr("提供方错误类型") }, get provider_trace_id() { return tr("提供方跟踪 ID") }, get error_body_sample_bytes() { return tr("错误响应采样字节数") }, get error_body_complete() { return tr("错误响应是否完整读取") }, get error_body_read_failed() { return tr("错误响应读取失败") },
  get endpoint_format() { return tr("接口地址格式") }, get ai_protocol() { return tr("AI 协议") }, get max_output_tokens() { return tr("输出预算（token）") }, get reasoning_effort() { return tr("推理强度") }, get prompt_version() { return tr("提示词版本") }, get request_bytes() { return tr("请求 JSON 字节数") }, get system_prompt_bytes() { return tr("系统提示词字节数") }, get report_blocks_bytes() { return tr("正文块 JSON 字节数") }, get report_block_count() { return tr("正文块数") }, get actor_candidate_count() { return tr("发送的组织候选数") }, get input_tokens() { return tr("输入 token") }, get output_tokens() { return tr("输出 token（含推理）") }, get reasoning_tokens() { return tr("推理 token") }, get cached_input_tokens() { return tr("缓存输入 token") }, get total_tokens() { return tr("总 token") },
  get occurred_at() { return tr("发生时间") }, get stage() { return tr("处理阶段") }, get code() { return tr("错误代码") }, get cause_code() { return tr("底层错误代码") },
  get attempt() { return tr("尝试次数") }, get claim_token() { return tr("任务标识") }, get phase() { return tr("请求阶段") }, get host() { return tr("目标主机") }, get port() { return tr("目标端口") },
  get method() { return tr("请求方法") }, get proxy_env_keys() { return tr("已设置的代理环境变量（不代表实际使用）") }, get http_status() { return tr("HTTP 状态") }, get elapsed_ms() { return tr("请求耗时（毫秒）") }, get total_elapsed_ms() { return tr("处理耗时（毫秒）") },
  get timeout() { return tr("是否超时") }, get connect() { return tr("是否连接阶段失败") }, get cause_hint() { return tr("网络原因提示") }, get io_kind() { return tr("系统错误类别") }, get os_error() { return tr("系统错误码") },
  get timeout_seconds() { return tr("请求超时设置（秒）") }, get processing_timeout_seconds() { return tr("处理时限（秒）") }, get record() { return tr("未通过校验的条目序号") }, get rejected() { return tr("证据未通过的条数") },
  get selector() { return tr("正文选择器") }, get reason() { return tr("失败原因分类") }, get html_bytes() { return tr("页面字节数") }, get text_bytes() { return tr("有效正文字节数") },
  get expected_field() { return tr("预期响应字段") }, get responses_output_present() { return tr("响应包含 Responses output 字段") },
  get response_bytes() { return tr("响应字节数") }, get json_line() { return tr("JSON 错误行") }, get json_column() { return tr("JSON 错误列") },
  get content_bytes() { return tr("模型回复字节数") }, get content_format() { return tr("模型回复格式") }, get json_error_category() { return tr("JSON 错误类别") }, get finish_reason() { return tr("模型结束原因") },
  get refusal_present() { return tr("是否包含拒答标记") }, get reasoning_content_present() { return tr("是否包含独立推理内容") },
  get received_bytes() { return tr("已读取字节数") }, get content_length() { return tr("响应声明字节数") }, get limit_bytes() { return tr("读取上限") },
  get sqlstate() { return tr("数据库错误代码") }, get connection_closed() { return tr("数据库连接已关闭") },
}
const evidenceReasons = {
  get evidence_not_in_body() { return tr("引用不是正文中的连续原文") },
  get evidence_block_not_found() { return tr("引用的正文块不存在") },
  get evidence_unit_not_found() { return tr("所选原文证据单元不存在或不适用于该 IOC 类型") },
  get ioc_not_in_evidence() { return tr("引用未包含该 IOC 的完整值") },
  get evidence_context_scope_mismatch() { return tr("上下文与 IOC 不属于同一列表范围") },
  get evidence_context_record_field_unsupported() { return tr("上下文字段不能支持该 IOC 的恶意结论") },
  get evidence_context_record_heading_required() { return tr("应引用该 IOC 所属记录的标题") },
  get evidence_context_record_mismatch() { return tr("上下文属于另一条资产记录") },
  get evidence_context_missing() { return tr("只有 IOC 值，缺少支持其角色的上下文") },
  get evidence_too_short() { return tr("历史规则判定引用过短") },
}
const diagnosticValueLabels = {
  prompt_source: { get default() { return tr("系统默认") }, get custom() { return tr("用户自定义") } },
  correction_method: { get record_heading() { return tr("根据所属记录标题重新定位") } },
  context_block_kind: { get heading() { return tr("标题") }, get table_header() { return tr("表头") }, get list_item() { return tr("列表项") }, get paragraph() { return tr("普通段落") }, get record_heading() { return tr("编号记录标题") }, get record_field() { return tr("编号记录的关联字段") }, get record_metadata() { return tr("编号记录的其他字段") } },
  ioc_block_kind: { get heading() { return tr("标题") }, get table_header() { return tr("表头") }, get list_item() { return tr("列表项") }, get paragraph() { return tr("普通段落") }, get record_heading() { return tr("编号记录标题") }, get record_field() { return tr("编号记录的关联字段") }, get record_metadata() { return tr("编号记录的其他字段") } },
  provider_error_category: { get model_unavailable() { return tr("模型或上游模型路由不可用") }, get endpoint_not_found() { return tr("提供方报告接口路由不存在") }, get authentication() { return tr("认证失败") }, get quota() { return tr("额度不足") }, get permission() { return tr("账号权限不足") }, get unsupported_parameter() { return tr("请求参数不受支持") }, get json_mode_prompt_missing() { return tr("JSON 模式要求提示词明确包含 JSON 字样") }, get unclassified() { return tr("无法从安全分类确定原因") } },
  endpoint_format: { get base_url() { return tr("基础地址（已追加协议路径）") }, get chat_completions() { return tr("完整 Chat Completions 地址") }, get responses() { return tr("完整 Responses 地址") }, get custom() { return tr("自定义完整路径") } },
  finish_reason: { get stop() { return tr("正常结束（stop）") }, get length() { return tr("达到输出上限（length）") }, get content_filter() { return tr("内容过滤（content_filter）") }, get tool_calls() { return tr("请求工具调用（tool_calls）") }, get function_call() { return tr("请求函数调用（function_call）") }, get missing() { return tr("接口未提供") }, get other() { return tr("其他结束原因") } },
  content_format: { get empty() { return tr("空回复") }, get missing() { return tr("缺少回复文本") }, get markdown_fence() { return tr("Markdown 代码围栏") }, get reasoning_prefix() { return tr("以思考标签开头") }, get json_object() { return tr("以 JSON 对象开头") }, get json_array() { return tr("以 JSON 数组开头") }, get other_text() { return tr("其他文本") } },
  json_error_category: { get syntax() { return tr("语法错误（syntax）") }, get eof() { return tr("内容提前结束（eof）") }, get data() { return tr("数据类型错误（data）") }, get io() { return tr("读取错误（io）") } },
  reason: { ...evidenceReasons, get invalid_json_syntax() { return tr("JSON 语法不合法") }, get incomplete_json() { return tr("JSON 内容不完整") }, get trailing_content() { return tr("JSON 后存在额外内容") }, get non_json_text() { return tr("回复不是 JSON 文本") }, get markdown_fence() { return tr("回复被 Markdown 代码围栏包裹") }, get reasoning_prefix() { return tr("回复以思考文本标签开头") }, get empty_content() { return tr("回复文本为空") }, get reasoning_only() { return tr("仅返回独立推理内容，缺少最终回复") }, get output_limit() { return tr("提供方报告达到输出上限") }, get content_filtered() { return tr("提供方过滤了回复") }, get model_refusal() { return tr("模型拒答") }, get unexpected_tool_call() { return tr("接口返回了未请求的工具或函数调用") } },
}
export function articleDiagnosticRows(diagnostic) {
  if (!diagnostic || typeof diagnostic !== 'object') return []
  return Object.entries(diagnosticFields).flatMap(([key, label]) => {
    const value = diagnostic[key]
    if (!['string', 'number', 'boolean'].includes(typeof value)) return []
    const text = key === 'stage' ? extractionStages[value] || value : diagnosticValueLabels[key]?.[value] || (typeof value === 'boolean' ? (value ? tr("是") : tr("否")) : String(value))
    return [{ key, label, value: text.slice(0, 512) }]
  })
}

export function evidenceReasonLabel(reason) {
  return Object.hasOwn(evidenceReasons, reason) ? evidenceReasons[reason] : tr("原文证据未通过校验")
}
// Server ranges use UTF-8 byte offsets; JavaScript string indices use UTF-16.
// Check both character boundaries and the exact quote before highlighting.
export function evidenceExcerpt(body, span) {
  if (typeof body !== 'string' || !Number.isSafeInteger(span?.start) || !Number.isSafeInteger(span?.end) || span.start < 0 || span.end <= span.start) return null
  const bytes = new TextEncoder().encode(body)
  if (span.end > bytes.length) return null
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    const quote = decoder.decode(bytes.slice(span.start, span.end))
    if (quote !== span.quote) return null
    return { before: decoder.decode(bytes.slice(0, span.start)), quote, after: decoder.decode(bytes.slice(span.end)) }
  } catch { return null }
}
