import http from './http'
import { applyTimeSettings } from './systemTime'

let pending
export async function loadSystemPreferences() {
  if (pending) return pending
  pending = http.get('/api/system/preferences').then((response) => {
    if (!response.data?.success) throw new Error('系统设置加载失败')
    applyTimeSettings(response.data.data)
    return response.data.data
  }).finally(() => { pending = null })
  return pending
}

export function syncSystemPreferences() {
  const refresh = () => {
    if (document.visibilityState === 'visible') loadSystemPreferences().catch(() => {})
  }
  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', refresh)
  const timer = window.setInterval(refresh, 30_000)
  window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true })
}
