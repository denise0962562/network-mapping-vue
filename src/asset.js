import { createApp } from 'vue'
import AssetDetail from './views/AssetDetail.vue'
import './style.css'
import { getCookieValue } from './utils/csrf'
import './utils/http'

if (!getCookieValue('csrf_token')) {
  window.location.replace('/login')
}

const app = createApp(AssetDetail)

app.mount('#asset')
