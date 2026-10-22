export const draftLifetime = 7 * 24 * 60 * 60 * 1000
const key = user => `network-mapping:llm-draft:v1:${user}`
export function readDraft(storage, user, now = Date.now()) {
  if (!Number.isInteger(user)) return ''
  try {
    const value = JSON.parse(storage?.getItem(key(user)) || 'null')
    if (!value || typeof value.text !== 'string' || value.text.length > 4 * 1024 * 1024 || !Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + draftLifetime) {
      storage?.removeItem(key(user)); return ''
    }
    return value.text
  } catch { try { storage?.removeItem(key(user)) } catch {} return '' }
}
export function writeDraft(storage, user, text, now = Date.now()) {
  if (!Number.isInteger(user)) return false
  try {
    if (!text) storage?.removeItem(key(user))
    else storage?.setItem(key(user), JSON.stringify({ text, expiresAt: now + draftLifetime }))
    return Boolean(storage)
  } catch { return false }
}
export function historyParameters(parameters = {}, protocol = 'chat') {
  const result = { reasoning_effort: 'inherit', max_output_tokens: '', temperature: '', top_p: '', timeout_seconds: '', stream: 'inherit', token_limit_field: 'inherit' }
  for (const field of ['reasoning_effort', 'max_output_tokens', 'temperature', 'top_p', 'timeout_seconds']) {
    if (parameters[field] != null) result[field] = parameters[field]
  }
  if (typeof parameters.stream === 'boolean') result.stream = parameters.stream ? 'on' : 'off'
  if (protocol === 'chat' && ['max_tokens', 'max_completion_tokens'].includes(parameters.token_limit_field)) result.token_limit_field = parameters.token_limit_field
  return result
}
