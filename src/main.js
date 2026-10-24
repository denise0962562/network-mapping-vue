import StartupFailure from './components/StartupFailure.vue'
import { i18n } from './i18n/index.js'
import LanguageSelect from './components/LanguageSelect.vue'
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
      const app = createApp(App).use(i18n).component('LanguageSelect', LanguageSelect)
      app.component('SystemDateTimeInput', SystemDateTimeInput)
      app.use(router)
      app.mount('#app')
      syncSystemPreferences()
    } catch {
      const fallback = createApp(StartupFailure, { retry: () => { fallback.unmount(); start() } }).use(i18n)
      fallback.mount(root)
    }
  }
  start()
}
