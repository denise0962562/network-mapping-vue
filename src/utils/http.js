import axios from 'axios'
import { getCookieValue } from './csrf'

function shouldAttachCsrf(config) {
  const baseURL = config.baseURL ? new URL(config.baseURL, window.location.origin) : null
  const targetUrl = new URL(config.url || '', baseURL || window.location.origin)
  if (targetUrl.origin !== window.location.origin) return false
  return targetUrl.pathname.startsWith('/api') || targetUrl.pathname === '/logout'
}

const http = axios.create({
  withCredentials: true,
})

http.interceptors.request.use((config) => {
  if (shouldAttachCsrf(config)) {
    const token = getCookieValue('csrf_token')
    if (token) {
      config.headers = config.headers || {}
      config.headers['X-CSRF-Token'] = token
    }
  }
  return config
})

export default http
