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
    createApp(AssetDetail).mount('#asset')
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
if (getCookieValue('csrf_token')) start()
