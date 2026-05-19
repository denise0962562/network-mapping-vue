import axios from 'axios'
import { expireCookie, getCookieValue } from './csrf'

let isRedirectingToLogin = false

function shouldAttachCsrf(config) {
  const baseURL = config.baseURL ? new URL(config.baseURL, window.location.origin) : null
  const targetUrl = new URL(config.url || '', baseURL || window.location.origin)
  if (targetUrl.origin !== window.location.origin) return false
  if (targetUrl.pathname === '/api/login') return false
  return targetUrl.pathname.startsWith('/api') || targetUrl.pathname === '/logout'
}

function getResponsePathname(response) {
  const config = response?.config || {}
  const baseURL = config.baseURL ? new URL(config.baseURL, window.location.origin) : null
  return new URL(config.url || '', baseURL || window.location.origin).pathname
}

function shouldHandleUnauthorizedResponse(response) {
  const pathname = getResponsePathname(response)
  if (window.location.pathname === '/login' && (pathname === '/api/login' || pathname === '/api/totp/verify')) {
    return false
  }
  return true
}

const http = axios.create({
  withCredentials: true,
})

function handleUnauthorized() {
  if (getCookieValue('csrf_token')) {
    expireCookie('csrf_token')
  }

  if (isRedirectingToLogin) return

  isRedirectingToLogin = true
  if (window.location.pathname !== '/login') {
    window.location.replace('/login')
  } else {
    isRedirectingToLogin = false
  }
}

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

http.interceptors.response.use(
  (response) => {
    if (response?.status === 401 && shouldHandleUnauthorizedResponse(response)) {
      handleUnauthorized()
    }
    return response
  },
  (error) => {
    if (error?.response?.status === 401 && shouldHandleUnauthorizedResponse(error.response)) {
      handleUnauthorized()
    }
    return Promise.reject(error)
  }
)

export default http
