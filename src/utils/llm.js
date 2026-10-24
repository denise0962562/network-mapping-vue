import { tr } from '../i18n/index.js'
export function clone(value) { return JSON.parse(JSON.stringify(value)) }
export function transportForm(global = false) {
  return { proxy_mode: global ? 'system' : 'inherit', proxy_url: '', proxy_configured: false, headers_mode: global ? 'replace' : 'merge', headers: [], session_mode: global ? 'disabled' : 'inherit', session_header: 'x-opencode-session', session_value: '', session_configured: false, stream: global ? false : null }
}
export function providerForm(source = {}) {
  return { id: null, name: '', preset: '', endpoint: 'https://api.openai.com/v1', models_url: '', protocol: 'chat', default_model: '', models: [], key_env: '', timeout_seconds: 180, max_output_tokens: 65536, reasoning_effort: 'default', ...clone(source), transport: { ...transportForm(), ...clone(source.transport || {}) }, credential: '', clear_credential: false }
}
export function availableModels(provider) {
  return (provider?.models || []).filter(m => m.available && ['', 'chat', 'responses'].includes(m.protocol || ''))
}
export function settingsPayload(state, overrides = {}) {
  return { expected_revision: state.revision, enabled: state.enabled, provider_id: state.provider_id || null, model_id: state.model_id || null, global: state.global, ...overrides }
}
export function mergeModels(existing, fetched) {
  const found = new Map(fetched.map(m => [m.id, m]))
  return [...fetched, ...existing.filter(m => !found.has(m.id)).map(m => ({ ...m, available: false }))]
}
const errors = {
  get llm_history_configuration_changed() { return tr("历史对话的供应商、接口或协议已改变，请新建会话后调试。") },
  get llm_history_too_large() { return tr("对话超过历史保留大小限制，请缩短输入或新建会话。") },
  get llm_invalid_messages() { return tr("对话内容为空、过长或格式无效，请检查输入或新建会话。") },
  get intel_revision_conflict() { return tr("配置已被其他操作修改，请刷新后重试；当前未保存的内容仍保留。") },
  get intel_admin_required() { return tr("只有管理员可以管理 LLM。") },
  get intel_not_found() { return tr("供应商已被删除，请刷新列表。") },
  get intel_storage_unavailable() { return tr("配置存储暂不可用，请稍后重试。") },
  get intel_credential_missing() { return tr("请先为供应商配置 API Key 或认证请求头。") },
  get intel_invalid_credential() { return tr("API Key 格式无效，不能同时填写并清除凭据。") },
  get intel_credential_crypto_failed() { return tr("凭据无法解密，请检查服务端加密密钥。") },
  get intel_invalid_ai_settings() { return tr("请检查模型、协议、输出预算和推理强度。") },
  get intel_invalid_ai_prompt() { return tr("提示词不能为空白、包含非法控制字符或超过 65536 字节。") },
  get intel_ai_protocol_mismatch() { return tr("完整端点与模型协议不匹配，请修改接口地址或协议。") },
  get intel_url_not_allowed() { return tr("接口需使用公网 HTTPS 地址和 443 端口，不能包含 URL 凭据或片段。") },
  get intel_ai_timeout() { return tr("模型请求超时，可调整供应商的请求时限。") },
  get intel_ai_request_timeout() { return tr("连接供应商或读取响应超时，请检查网络与请求时限。") },
  get intel_ai_transport() { return tr("供应商连接失败，请检查服务端网络和代理。") },
  get intel_ai_dns_failed() { return tr("服务端无法解析供应商域名，请检查 DNS 和代理。") },
  get intel_ai_proxy_dns_failed() { return tr("服务端无法解析代理域名。") },
  get intel_ai_http_status() { return tr("供应商返回请求错误，请检查凭据、模型和协议。") },
  get intel_ai_rate_limited() { return tr("供应商限流，请稍后重试。") },
  get intel_ai_empty_content() { return tr("供应商未返回可显示的文本。") },
  get intel_ai_invalid_response() { return tr("供应商响应不符合所选协议。") },
  get intel_ai_output_truncated() { return tr("模型输出达到上限，请调整输出预算或缩短输入。") },
  get intel_ai_refused() { return tr("模型拒绝了该请求。") },
  get intel_ai_content_filtered() { return tr("供应商过滤了该请求或响应。") },
  get llm_invalid_configuration() { return tr("配置无效，请检查地址、模型、请求头及继承选项。") },
  get llm_model_unavailable() { return tr("当前模型不可用或协议尚未支持，请选择其他模型。") },
  get llm_session_header_conflict() { return tr("自定义请求头与 session 头重名，请只在一处配置。") },
  get llm_provider_in_use() { return tr("该供应商正在用于 IOC 提取，请更换组合或同时暂停提取。") },
  get llm_models_url_required() { return tr("请先配置并保存模型列表地址。") },
  get llm_invalid_model_list() { return tr("模型列表格式无效，可手工添加模型。") },
  get llm_model_list_too_large() { return tr("模型列表超过大小限制，请手工配置。") },
  get llm_secret_unavailable() { return tr("配置无法解密，请检查服务端加密密钥。") },
  get llm_debug_busy() { return tr("已有调试请求正在运行，请停止后重试。") },
  get llm_invalid_messages() { return tr("对话为空或超过限制，请缩短内容或新建会话。") },
  get llm_invalid_debug_parameters() { return tr("调试参数无效，请检查推理强度、数值范围及当前协议支持的选项。") },
  get llm_invalid_stream() { return tr("供应商未返回有效的 SSE 流，请检查流式支持。") },
  get llm_stream_failed() { return tr("流式响应失败，请检查供应商连接；未完整的回答不会继续发送。") },
  get llm_stream_incomplete() { return tr("响应意外中断，请重试。") },
  get llm_response_too_large() { return tr("响应超过大小限制，请减少输出预算。") },
  get llm_settings_moved() { return tr("AI 设置已迁移至 LLM 页面，请部署配套控制台。") },
}
export function llmError(error) {
  const code = typeof error === 'string' ? error : error?.response?.data?.code
  return errors[code] || (error?.response?.status === 403 ? errors.intel_admin_required : error?.response?.status === 404 ? tr("当前服务端尚不支持 LLM 管理，请升级配套服务端。") : tr("操作失败，请检查服务端连接后重试。"))
}

// POST SSE supports CSRF and cancellation; parsing is independent of browser I/O.
export async function readEvents(body, onEvent) {
  const reader = body.getReader(), decoder = new TextDecoder()
  let pending = '', bytes = 0, terminal = false
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 16 * 1024 * 1024) throw new Error('llm_response_too_large')
      pending += decoder.decode(value, { stream: true })
      let match
      while ((match = /\r?\n\r?\n/.exec(pending))) {
        const frame = pending.slice(0, match.index)
        pending = pending.slice(match.index + match[0].length)
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (!data) continue
        const event = JSON.parse(data)
        if (terminal) throw new Error('llm_invalid_stream')
        if (event.type === 'done' || event.type === 'error') terminal = true
        onEvent(event)
      }
      if (pending.length > 1024 * 1024) throw new Error('llm_response_too_large')
    }
    if (!terminal) throw new Error('llm_stream_incomplete')
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
