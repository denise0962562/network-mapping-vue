import { i18n, locale, tr } from './i18n/index.js'
import { watch } from 'vue'
import LanguageSelect from './components/LanguageSelect.vue'
import { createApp } from 'vue'
import Login from './Login.vue'
import './style.css'

const app = createApp(Login).use(i18n).component('LanguageSelect', LanguageSelect)

app.mount('#login')

watch(locale, () => { document.title = tr('登录') + ' · Network Mapping' }, { immediate: true })
