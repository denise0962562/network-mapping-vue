import { tr } from '../i18n/index.js'
export const debugReasoningOptions = [
  { value: 'inherit', get label() { return tr("继承供应商设置") } },
  { value: 'default', get label() { return tr("接口默认（不发送）") } },
  { value: 'none', get label() { return tr("关闭推理") } },
  { value: 'minimal', get label() { return tr("最低（minimal）") } },
  { value: 'low', get label() { return tr("低（low）") } },
  { value: 'medium', get label() { return tr("中（medium）") } },
  { value: 'high', get label() { return tr("高（high）") } },
  { value: 'xhigh', get label() { return tr("更高（xhigh）") } },
  { value: 'max', get label() { return tr("最高（max）") } },
]

export function debugParameterForm() {
  return { reasoning_effort: 'inherit', max_output_tokens: '', temperature: '', top_p: '', timeout_seconds: '', stream: 'inherit', token_limit_field: 'inherit' }
}

export function debugParameterPayload(form, protocol = 'chat') {
  const value = {}
  if (!debugReasoningOptions.some(option => option.value === form.reasoning_effort)) throw new Error(tr("请选择有效的推理强度。"))
  if (form.reasoning_effort !== 'inherit') value.reasoning_effort = form.reasoning_effort
  for (const [key, label, min, max, integer] of [
    ['max_output_tokens', '输出上限', 1, 393216, true],
    ['temperature', '温度', 0, 2, false],
    ['top_p', 'Top P', 0, 1, false],
    ['timeout_seconds', '请求超时', 1, 1800, true],
  ]) {
    const input = form[key]
    if (input == null || String(input).trim() === '') continue
    const number = Number(input)
    if (typeof input === 'boolean' || !Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) throw new Error(tr("{0}须为 {1}–{2} 范围内的{3}。", [label, min, max, integer ? '整数' : '数值']))
    value[key] = number
  }
  if (!['inherit', 'on', 'off'].includes(form.stream)) throw new Error(tr("请选择有效的流式输出方式。"))
  if (form.stream !== 'inherit') value.stream = form.stream === 'on'
  if (protocol === 'chat' && form.token_limit_field !== 'inherit') {
    if (!['max_tokens', 'max_completion_tokens'].includes(form.token_limit_field)) throw new Error(tr("请选择有效的输出上限字段。"))
    value.token_limit_field = form.token_limit_field
  }
  return value
}

export function debugParameterSummary(parameters) {
  if (!parameters) return ''
  const effort = debugReasoningOptions.find(option => option.value === parameters.reasoning_effort)?.label || parameters.reasoning_effort
  return [
    effort ? tr("推理：{0}", [effort]) : '',
    parameters.max_output_tokens != null ? tr("上限 {0} token", [parameters.max_output_tokens]) : '',
    parameters.temperature != null ? tr("温度 {0}", [parameters.temperature]) : '',
    parameters.top_p != null ? `Top P ${parameters.top_p}` : '',
    parameters.timeout_seconds != null ? tr("超时 {0} 秒", [parameters.timeout_seconds]) : '',
    parameters.stream != null ? tr("流式{0}", [parameters.stream ? '开启' : '关闭']) : '',
  ].filter(Boolean).join(' · ')
}

export function debugOutputRate(usage, elapsedMs) {
  const tokens = usage?.output_tokens
  if (!Number.isSafeInteger(tokens) || tokens < 0 || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return '—'
  const rate = tokens * 1000 / elapsedMs
  return Number.isFinite(rate) ? `${rate.toFixed(1)} token/s` : '—'
}

export function debugCacheUsage(usage) {
  const cached = usage?.cached_input_tokens, input = usage?.input_tokens
  const validCached = Number.isSafeInteger(cached) && cached >= 0
  return {
    tokens: validCached ? `${cached} token` : '—',
    hitRate: validCached && Number.isSafeInteger(input) && input > 0 && cached <= input
      ? `${(cached / input * 100).toFixed(1)}%` : '—',
  }
}
