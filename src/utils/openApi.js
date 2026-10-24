import { tr } from '../i18n/index.js'
export function apiError(error, fallback = tr("操作失败，请稍后重试。")) {
  const data = error?.response?.data
  return { code: data?.error?.code || '', message: data?.error?.message || data?.message || fallback, requestId: data?.request_id || error?.response?.headers?.['x-request-id'] || '' }
}
// Policy documents contain JSON values; this also accepts Vue reactive proxies.
export function cloneDocument(value) { return JSON.parse(JSON.stringify(value)) }
export function redactInvocationResult(value) {
  if (Array.isArray(value)) return value.map(redactInvocationResult)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    ['signing_secret', 'token', 'secret_hash'].includes(key) ? '[REDACTED]' : redactInvocationResult(item),
  ]))
}
export function endpointPath(template, parameters, encoded = false) {
  return template.replace(/\{([^}]+)\}/g, (_, key) => {
    const value = parameters[key] || `{${key}}`
    return encoded ? encodeURIComponent(value) : value
  })
}
export function applicationStatus(status) {
  return { pending: ['待审批', 'badge-warning'], active: ['已启用', 'badge-success'], paused: ['已暂停', 'badge-ghost'], archived: ['已归档', 'badge-ghost'] }[status] || [status, 'badge-ghost']
}
export function samplePayload(path, method) {
  if (path === '/assets/search' || path === '/assets/search/validate') return { query: 'ip IN 192.0.2.0/24 AND port = 443', ...(path.endsWith('/validate') ? {} : { page_size: 50 }) }
  if (path === '/assets/lookup') return { ips: ['192.0.2.1'], fields: ['ip', 'port', 'service'] }
  if (path === '/domains/lookup') return { domains: ['api.example.com'] }
  if (path === '/tasks' && method === 'POST' || path === '/tasks/validate' || path === '/tasks/estimate') return { targets: ['192.0.2.1'], ports: '80,443', scan_profile: 'service_inventory', client_reference: 'inventory-001' }
  if (path === '/exports') return method === 'POST' ? { query: 'ip IN 192.0.2.0/24', format: 'csv', fields: ['ip', 'port', 'service'] } : {}
  if (path === '/reports' && method === 'POST') return { start_at: '2026-10-01T00:00:00Z', end_at: '2026-10-08T00:00:00Z', format: 'json' }
  if (path.endsWith('/refresh')) return { ports: '80,443', scan_profile: 'service_inventory' }
  if (path === '/analytics/overview') return {}
  if (path === '/analytics/distribution') return { data_type: 'port', group_by: 'port' }
  if (path.startsWith('/analytics/')) return { data_type: 'discovery', group_by: 'day' }
  if (path === '/webhooks' && method === 'POST' || path.startsWith('/webhooks/') && method === 'PATCH') return { url: 'https://hooks.example.com/network-events', event_types: ['task.succeeded', 'export.succeeded'], enabled: true }
  if (path === '/saved-searches' && method === 'POST' || path.startsWith('/saved-searches/') && method === 'PATCH') return { name: 'HTTPS 资产', query: 'port = 443', ...(method === 'PATCH' ? { expected_revision: 1 } : {}) }
  if (path.includes('/annotations/') && method === 'PUT') return { value: '生产环境' }
  return {}
}
function shellQuote(value) { return `'${String(value).replaceAll("'", "'\\''")}'` }
export function curlExample(origin, method, path, payload) {
  const base = `${origin}/open-api/v1${path}`
  const data = Object.keys(payload || {}).length ? payload : null
  const url = method === 'GET' && data ? `${base}?${new URLSearchParams(Object.entries(data).map(([k,v]) => [k, Array.isArray(v) ? v.join(',') : String(v)]))}` : base
  const lines = [`curl --request ${method} ${shellQuote(url)}`, `  --header 'Authorization: Bearer YOUR_API_KEY'`]
  if (method === 'POST') lines.push(`  --header 'Idempotency-Key: UNIQUE_REQUEST_ID'`)
  if (method !== 'GET' && data) lines.push(`  --header 'Content-Type: application/json'`, `  --data ${shellQuote(JSON.stringify(data))}`)
  return lines.join(' \\\n')
}
export function isMutation(method, path) { return !['GET', 'HEAD'].includes(method) && !['/assets/search', '/assets/search/validate', '/assets/lookup', '/domains/lookup', '/vulnerabilities/search', '/vulnerabilities/summary', '/tasks/validate', '/tasks/estimate'].includes(path) && !path.startsWith('/analytics/') }
