export const debugReasoningOptions = [
  { value: 'inherit', label: '继承供应商设置' },
  { value: 'default', label: '接口默认（不发送）' },
  { value: 'none', label: '关闭推理' },
  { value: 'minimal', label: '最低（minimal）' },
  { value: 'low', label: '低（low）' },
  { value: 'medium', label: '中（medium）' },
  { value: 'high', label: '高（high）' },
  { value: 'xhigh', label: '更高（xhigh）' },
  { value: 'max', label: '最高（max）' },
]

export function debugParameterForm() {
  return { reasoning_effort: 'inherit', max_output_tokens: '', temperature: '', top_p: '', timeout_seconds: '', stream: 'inherit', token_limit_field: 'inherit' }
}

export function debugParameterPayload(form, protocol = 'chat') {
  const value = {}
  if (!debugReasoningOptions.some(option => option.value === form.reasoning_effort)) throw new Error('请选择有效的推理强度。')
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
    if (typeof input === 'boolean' || !Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) throw new Error(`${label}须为 ${min}–${max} 范围内的${integer ? '整数' : '数值'}。`)
    value[key] = number
  }
  if (!['inherit', 'on', 'off'].includes(form.stream)) throw new Error('请选择有效的流式输出方式。')
  if (form.stream !== 'inherit') value.stream = form.stream === 'on'
  if (protocol === 'chat' && form.token_limit_field !== 'inherit') {
    if (!['max_tokens', 'max_completion_tokens'].includes(form.token_limit_field)) throw new Error('请选择有效的输出上限字段。')
    value.token_limit_field = form.token_limit_field
  }
  return value
}

export function debugParameterSummary(parameters) {
  if (!parameters) return ''
  const effort = debugReasoningOptions.find(option => option.value === parameters.reasoning_effort)?.label || parameters.reasoning_effort
  return [
    effort ? `推理：${effort}` : '',
    parameters.max_output_tokens != null ? `上限 ${parameters.max_output_tokens} token` : '',
    parameters.temperature != null ? `温度 ${parameters.temperature}` : '',
    parameters.top_p != null ? `Top P ${parameters.top_p}` : '',
    parameters.timeout_seconds != null ? `超时 ${parameters.timeout_seconds} 秒` : '',
    parameters.stream != null ? `流式${parameters.stream ? '开启' : '关闭'}` : '',
  ].filter(Boolean).join(' · ')
}
