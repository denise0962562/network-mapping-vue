import StartupFailure from './components/StartupFailure.vue'
import { i18n, locale, tr } from './i18n/index.js'
import { watch } from 'vue'
import LanguageSelect from './components/LanguageSelect.vue'
import { createApp } from 'vue'
import Search from './Search.vue'
import './style.css'
import { getCookieValue } from './utils/csrf'
import './utils/http'
import { loadSystemPreferences, syncSystemPreferences } from './utils/systemPreferences'

if (!getCookieValue('csrf_token')) {
  window.location.replace('/login')
}

async function start() {
  const root = document.querySelector('#search')
  try {
    await loadSystemPreferences()
    createApp(Search).use(i18n).component('LanguageSelect', LanguageSelect).mount('#search')
    syncSystemPreferences()
  } catch {
    const fallback = createApp(StartupFailure, { retry: () => { fallback.unmount(); start() } }).use(i18n)
    fallback.mount(root)
  }
}
if (getCookieValue('csrf_token')) start()

watch(locale, () => { document.title = tr('搜索') + ' · Network Mapping' }, { immediate: true })
