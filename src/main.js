import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import ApexCharts from 'vue3-apexcharts'

const app = createApp(App)

app.use(router)
app.component('apexchart',ApexCharts)
app.mount('#app')
