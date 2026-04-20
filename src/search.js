import { createApp } from 'vue'
import Search from './Search.vue'
import './style.css'
import { getCookieValue } from './utils/csrf'

if (!getCookieValue('csrf_token')) {
  window.location.replace('/login')
}

const app = createApp(Search)

app.mount('#search')
