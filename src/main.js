import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import ApexCharts from 'vue3-apexcharts'
import { getCookieValue } from './utils/csrf'
import './utils/http'

const csrfToken = getCookieValue('csrf_token')

if (!csrfToken) {
  window.location.replace('/login')
} else {
  const app = createApp(App)
  app.use(router)
  app.component('apexchart', ApexCharts)
  app.mount('#app')
}
