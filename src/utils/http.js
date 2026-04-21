import axios from 'axios'
import { expireCookie, getCookieValue } from './csrf'

let isRedirectingToLogin = false

function shouldAttachCsrf(config) {
  const baseURL = config.baseURL ? new URL(config.baseURL, window.location.origin) : null
  const targetUrl = new URL(config.url || '', baseURL || window.location.origin)
  if (targetUrl.origin !== window.location.origin) return false
  return targetUrl.pathname.startsWith('/api') || targetUrl.pathname === '/logout'
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
    if (response?.status === 401) {
      handleUnauthorized()
    }
    return response
  },
  (error) => {
    if (error?.response?.status === 401) {
      handleUnauthorized()
    }
    return Promise.reject(error)
  }
)

export default http
