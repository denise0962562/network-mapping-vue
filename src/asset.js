import StartupFailure from './components/StartupFailure.vue'
import { i18n, locale, tr } from './i18n/index.js'
import { watch } from 'vue'
import LanguageSelect from './components/LanguageSelect.vue'
import { createApp } from 'vue'
import AssetDetail from './views/AssetDetail.vue'
import './style.css'
import { getCookieValue } from './utils/csrf'
import './utils/http'
import { loadSystemPreferences, syncSystemPreferences } from './utils/systemPreferences'

if (!getCookieValue('csrf_token')) {
  window.location.replace('/login')
}

async function start() {
  const root = document.querySelector('#asset')
  try {
    await loadSystemPreferences()
    createApp(AssetDetail).use(i18n).component('LanguageSelect', LanguageSelect).mount('#asset')
    syncSystemPreferences()
  } catch {
    const fallback = createApp(StartupFailure, { retry: () => { fallback.unmount(); start() } }).use(i18n)
    fallback.mount(root)
  }
}
if (getCookieValue('csrf_token')) start()

watch(locale, () => { document.title = tr('资产详情') + ' · Network Mapping' }, { immediate: true })
