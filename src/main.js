import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { getCookieValue } from './utils/csrf'
import './utils/http'
import SystemDateTimeInput from './components/SystemDateTimeInput.vue'
import { loadSystemPreferences, syncSystemPreferences } from './utils/systemPreferences'

const csrfToken = getCookieValue('csrf_token')

if (!csrfToken) {
  window.location.replace('/login')
} else {
  async function start() {
    const root = document.querySelector('#app')
    try {
      await loadSystemPreferences()
      const app = createApp(App)
      app.component('SystemDateTimeInput', SystemDateTimeInput)
      app.use(router)
      app.mount('#app')
      syncSystemPreferences()
    } catch {
      root.replaceChildren()
      const message = document.createElement('p')
      message.textContent = '系统时间设置加载失败，请重试。'
      const retry = document.createElement('button')
      retry.className = 'btn btn-neutral btn-sm'
      retry.textContent = '重新加载'
      retry.onclick = start
      root.append(message, retry)
    }
  }
  start()
}
