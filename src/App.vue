<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { expireCookie } from './utils/csrf'
import http from './utils/http'
import ReLoginModal from './components/ReLoginModal.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import packageInfo from '../package.json'

const route = useRoute()
const navbarTitle = computed(() => route.meta?.title || '仪表盘')
const logoutLoading = ref(false)
const drawerOpen = ref(true)
const activeSettingsTab = ref('system')
const reLoginModalRef = ref(null)
const isAdmin = ref(false)
const frontendVersion = packageInfo.version
const serverVersion = ref('')
const maintenanceStatus = ref(null)
const taskMenuOpen = ref(route.path === '/create_scan' || route.path.startsWith('/task'))
const analysisMenuOpen = ref(route.path.startsWith('/analysis'))
const logsMenuOpen = ref(route.path === '/audit' || route.path.startsWith('/requests'))
const settingsMenuOpen = ref(route.path.startsWith('/setting') || route.path === '/admin/tags')
let maintenanceRefreshTimer = null

const maintenancePhaseLabel = computed(() => (
  maintenanceStatus.value?.phase === 'draining' ? '正在通知 Scanner 进入系统维护' : '系统维护中'
))

watch(
  () => route.path,
  (path) => {
    if (path === '/create_scan' || path.startsWith('/task')) taskMenuOpen.value = true
    if (path.startsWith('/analysis')) analysisMenuOpen.value = true
    if (path === '/audit' || path.startsWith('/requests')) logsMenuOpen.value = true
    if (path.startsWith('/setting') || path === '/admin/tags') settingsMenuOpen.value = true
  },
)

async function loadServerVersion() {
  try {
    const response = await http.get('/api/version')
    serverVersion.value = response.data?.version || ''
  } catch (error) {
    console.error('load server version failed', error)
    serverVersion.value = ''
  }
}

async function loadCurrentRole() {
  try {
    const response = await http.get('/api/userinfo/get')
    const currentUser = Array.isArray(response.data) ? response.data[0] : response.data
    isAdmin.value = currentUser?.role === 1
    if (isAdmin.value) await loadMaintenanceStatus()
  } catch (error) {
    console.error('load current role failed', error)
    isAdmin.value = false
  }
}

async function loadMaintenanceStatus() {
  if (!isAdmin.value) return
  try {
    const response = await http.get('/api/admin/system-maintenance')
    maintenanceStatus.value = response.data?.data?.enabled ? response.data.data : null
  } catch (error) {
    console.error('load maintenance status failed', error)
  }
}

function onSessionExpired() {
  reLoginModalRef.value?.open()
}

function toggleAnalysisMenu() {
  if (!drawerOpen.value) {
    drawerOpen.value = true
    analysisMenuOpen.value = true
    return
  }
  analysisMenuOpen.value = !analysisMenuOpen.value
}

function toggleTaskMenu() {
  if (!drawerOpen.value) {
    drawerOpen.value = true
    taskMenuOpen.value = true
    return
  }
  taskMenuOpen.value = !taskMenuOpen.value
}

function toggleLogsMenu() {
  if (!drawerOpen.value) {
    drawerOpen.value = true
    logsMenuOpen.value = true
    return
  }
  logsMenuOpen.value = !logsMenuOpen.value
}

function toggleSettingsMenu() {
  if (!drawerOpen.value) {
    drawerOpen.value = true
    settingsMenuOpen.value = true
    return
  }
  settingsMenuOpen.value = !settingsMenuOpen.value
}

onMounted(() => {
  window.addEventListener('session-expired', onSessionExpired)
  loadCurrentRole()
  loadServerVersion()
  maintenanceRefreshTimer = window.setInterval(loadMaintenanceStatus, 30000)
})

onBeforeUnmount(() => {
  window.removeEventListener('session-expired', onSessionExpired)
  if (maintenanceRefreshTimer) window.clearInterval(maintenanceRefreshTimer)
})

async function handleLogout() {
  if (logoutLoading.value) return
  logoutLoading.value = true
  try {
    const response = await http.get('/logout', {
      validateStatus: () => true,
    })

    if (response.status === 500) {
      throw new Error('logout failed with status 500')
    }

    expireCookie('csrf_token')
    window.location.href = '/login'
  } catch (error) {
    console.error('logout failed', error)
  } finally {
    logoutLoading.value = false
  }
}
</script>

<template>
  <div class="font-sans bg-base-200 drawer lg:drawer-open">
    <input id="my-drawer-4" v-model="drawerOpen" type="checkbox" class="drawer-toggle" />

    <div class="drawer-content">
      <nav class="flex navbar w-full rounded-bl-xl rounded-br-xl bg-base-100 border-b-2 border-b-base-300">
        <label for="my-drawer-4" aria-label="open sidebar" class="btn btn-square btn-ghost">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            stroke-linejoin="round"
            stroke-linecap="round"
            stroke-width="2"
            fill="none"
            stroke="currentColor"
            class="my-1.5 inline-block size-4 transition-transform duration-300"
            :class="drawerOpen ? 'rotate-180' : 'rotate-0'"
          >
            <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"></path>
            <path d="M9 4v16"></path>
            <path d="M14 10l2 2l-2 2"></path>
          </svg>
        </label>

        <div class="px-4">{{ navbarTitle }}</div>

        <div class="ml-auto mr-2.5 flex items-center gap-2">
          <ThemeToggle />
          <div class="p-2.5">
            <a href="https://github.com/wshijiang/" target="_blank">
              <svg fill="currentColor" class="w-10 h-10" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M237.9 461.4C237.9 463.4 235.6 465 232.7 465C229.4 465.3 227.1 463.7 227.1 461.4C227.1 459.4 229.4 457.8 232.3 457.8C235.3 457.5 237.9 459.1 237.9 461.4zM206.8 456.9C206.1 458.9 208.1 461.2 211.1 461.8C213.7 462.8 216.7 461.8 217.3 459.8C217.9 457.8 216 455.5 213 454.6C210.4 453.9 207.5 454.9 206.8 456.9zM251 455.2C248.1 455.9 246.1 457.8 246.4 460.1C246.7 462.1 249.3 463.4 252.3 462.7C255.2 462 257.2 460.1 256.9 458.1C256.6 456.2 253.9 454.9 251 455.2zM316.8 72C178.1 72 72 177.3 72 316C72 426.9 141.8 521.8 241.5 555.2C254.3 557.5 258.8 549.6 258.8 543.1C258.8 536.9 258.5 502.7 258.5 481.7C258.5 481.7 188.5 496.7 173.8 451.9C173.8 451.9 162.4 422.8 146 415.3C146 415.3 123.1 399.6 147.6 399.9C147.6 399.9 172.5 401.9 186.2 425.7C208.1 464.3 244.8 453.2 259.1 446.6C261.4 430.6 267.9 419.5 275.1 412.9C219.2 406.7 162.8 398.6 162.8 302.4C162.8 274.9 170.4 261.1 186.4 243.5C183.8 237 175.3 210.2 189 175.6C209.9 169.1 258 202.6 258 202.6C278 197 299.5 194.1 320.8 194.1C342.1 194.1 363.6 197 383.6 202.6C383.6 202.6 431.7 169 452.6 175.6C466.3 210.3 457.8 237 455.2 243.5C471.2 261.2 481 275 481 302.4C481 398.9 422.1 406.6 366.2 412.9C375.4 420.8 383.2 435.8 383.2 459.3C383.2 493 382.9 534.7 382.9 542.9C382.9 549.4 387.5 557.3 400.2 555C500.2 521.8 568 426.9 568 316C568 177.3 455.5 72 316.8 72zM169.2 416.9C167.9 417.9 168.2 420.2 169.9 422.1C171.5 423.7 173.8 424.4 175.1 423.1C176.4 422.1 176.1 419.8 174.4 417.9C172.8 416.3 170.5 415.6 169.2 416.9zM158.4 408.8C157.7 410.1 158.7 411.7 160.7 412.7C162.3 413.7 164.3 413.4 165 412C165.7 410.7 164.7 409.1 162.7 408.1C160.7 407.5 159.1 407.8 158.4 408.8zM190.8 444.4C189.2 445.7 189.8 448.7 192.1 450.6C194.4 452.9 197.3 453.2 198.6 451.6C199.9 450.3 199.3 447.3 197.3 445.4C195.1 443.1 192.1 442.8 190.8 444.4zM179.4 429.7C177.8 430.7 177.8 433.3 179.4 435.6C181 437.9 183.7 438.9 185 437.9C186.6 436.6 186.6 434 185 431.7C183.6 429.4 181 428.4 179.4 429.7z"/></svg>
            </a>
          </div>
        </div>
      </nav>

      <div v-if="maintenanceStatus" role="alert" class="alert rounded-none border-x-0 border-t-0" :class="maintenanceStatus.phase === 'draining' ? 'alert-warning' : 'alert-error'">
        <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="font-medium">{{ maintenancePhaseLabel }}</div>
            <div class="truncate text-xs opacity-80">{{ maintenanceStatus.message }}</div>
          </div>
          <router-link class="btn btn-sm btn-ghost shrink-0" to="/setting/maintenance">查看并管理</router-link>
        </div>
      </div>

      <router-view />
    </div>

    <div class="drawer-side is-drawer-close:overflow-visible rounded-tr-xl rounded-br-xl border-r-2 border-r-base-300">
      <label for="my-drawer-4" aria-label="close sidebar" class="drawer-overlay"></label>
      <div class="flex min-h-full flex-col items-start bg-base-100 is-drawer-close:w-14 is-drawer-open:w-52">
        <ul v-if="activeSettingsTab === 'system'" class="menu w-full grow">
          <li>
            <router-link exact-active-class="active" class="is-drawer-close:tooltip is-drawer-close:tooltip-right" data-tip="仪表盘" to="/">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-linejoin="round" stroke-linecap="round" stroke-width="2" fill="none" stroke="currentColor" class="my-1.5 inline-block size-4"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
              <span class="is-drawer-close:hidden whitespace-nowrap">仪表盘</span>
            </router-link>
          </li>

          <li>
            <a class="is-drawer-close:tooltip is-drawer-close:tooltip-right" data-tip="Search" target="_blank" href="/search.html">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-linejoin="round" stroke-linecap="round" stroke-width="2" fill="none" stroke="currentColor" class="my-1.5 inline-block size-4">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="M21 21l-4.35-4.35"></path>
              </svg>
              <span class="is-drawer-close:hidden whitespace-nowrap">搜索</span>
            </a>
          </li>

          <li>
            <router-link active-class="active" class="is-drawer-close:tooltip is-drawer-close:tooltip-right" data-tip="扫描器" to="/scanner">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-1.5 inline-block size-4"><rect width="14" height="20" x="5" y="2" rx="2"/><path d="M15 14h.01"/><path d="M9 6h6"/><path d="M9 10h6"/></svg>
              <span class="is-drawer-close:hidden whitespace-nowrap">扫描器</span>
            </router-link>
          </li>

          <li>
            <button
              type="button"
              class="is-drawer-close:tooltip is-drawer-close:tooltip-right bg-transparent hover:bg-base-200 focus-visible:bg-base-200"
              data-tip="任务"
              :aria-expanded="taskMenuOpen"
              aria-controls="task-submenu"
              @click="toggleTaskMenu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-1.5 inline-block size-4"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
              <span class="is-drawer-close:hidden whitespace-nowrap">任务</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="ml-auto size-3.5 transition-transform duration-200 ease-out is-drawer-close:hidden"
                :class="taskMenuOpen ? 'rotate-90' : 'rotate-0'"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <Transition name="sidebar-submenu">
              <ul v-if="taskMenuOpen" id="task-submenu" class="overflow-hidden py-1 is-drawer-close:hidden">
                <li>
                  <router-link class="sidebar-submenu-item" exact-active-class="active" to="/task">
                    <span class="whitespace-nowrap">查看任务</span>
                  </router-link>
                </li>
                <li>
                  <router-link class="sidebar-submenu-item" exact-active-class="active" to="/create_scan">
                    <span class="whitespace-nowrap">创建任务</span>
                  </router-link>
                </li>
              </ul>
            </Transition>
          </li>

          <li>
            <button
              type="button"
              class="is-drawer-close:tooltip is-drawer-close:tooltip-right bg-transparent hover:bg-base-200 focus-visible:bg-base-200"
              data-tip="数据分析"
              :aria-expanded="analysisMenuOpen"
              aria-controls="analysis-submenu"
              @click="toggleAnalysisMenu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-1.5 inline-block size-4"><path d="M5 21V3"/><path d="M12 21V9"/><path d="M19 21v-6"/></svg>
              <span class="is-drawer-close:hidden whitespace-nowrap">数据分析</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="ml-auto size-3.5 transition-transform duration-200 ease-out is-drawer-close:hidden"
                :class="analysisMenuOpen ? 'rotate-90' : 'rotate-0'"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <Transition name="sidebar-submenu">
              <ul v-if="analysisMenuOpen" id="analysis-submenu" class="overflow-hidden py-1 is-drawer-close:hidden">
                <li>
                  <router-link class="sidebar-submenu-item" exact-active-class="active" to="/analysis/scan">
                    <span class="whitespace-nowrap">扫描分析</span>
                  </router-link>
                </li>
                <li v-if="isAdmin">
                  <router-link class="sidebar-submenu-item" exact-active-class="active" to="/analysis/performance">
                    <span class="whitespace-nowrap">性能基线</span>
                  </router-link>
                </li>
              </ul>
            </Transition>
          </li>

          <li>
            <button
              type="button"
              class="is-drawer-close:tooltip is-drawer-close:tooltip-right bg-transparent hover:bg-base-200 focus-visible:bg-base-200"
              data-tip="日志"
              :aria-expanded="logsMenuOpen"
              aria-controls="logs-submenu"
              @click="toggleLogsMenu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-1.5 inline-block size-4"><path d="M9 12l2 2 4-4"/><path d="M12 22c4.4-1 8-5 8-10V5l-8-3-8 3v7c0 5 3.6 9 8 10"/></svg>
              <span class="is-drawer-close:hidden whitespace-nowrap">日志</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="ml-auto size-3.5 transition-transform duration-200 ease-out is-drawer-close:hidden"
                :class="logsMenuOpen ? 'rotate-90' : 'rotate-0'"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <Transition name="sidebar-submenu">
              <ul v-if="logsMenuOpen" id="logs-submenu" class="overflow-hidden py-1 is-drawer-close:hidden">
                <li>
                  <router-link class="sidebar-submenu-item" exact-active-class="active" to="/audit">
                    <span class="whitespace-nowrap">审计日志</span>
                  </router-link>
                </li>
                <li v-if="isAdmin">
                  <router-link class="sidebar-submenu-item" exact-active-class="active" to="/requests">
                    <span class="whitespace-nowrap">请求日志</span>
                  </router-link>
                </li>
              </ul>
            </Transition>
          </li>

          <li v-if="isAdmin">
            <router-link active-class="active" class="is-drawer-close:tooltip is-drawer-close:tooltip-right" data-tip="报告中心" to="/reports">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-1.5 inline-block size-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>
              <span class="is-drawer-close:hidden whitespace-nowrap">报告中心</span>
            </router-link>
          </li>

          <li v-if="isAdmin">
            <router-link active-class="active" exact-active-class="active" class="is-drawer-close:tooltip is-drawer-close:tooltip-right" data-tip="健康告警" to="/health">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-1.5 inline-block size-4"><path d="M12 22c4.4-1 8-5 8-10V5l-8-3-8 3v7c0 5 3.6 9 8 10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
              <span class="is-drawer-close:hidden whitespace-nowrap">健康告警</span>
            </router-link>
          </li>

          <li v-if="isAdmin">
            <router-link active-class="active" exact-active-class="active" class="is-drawer-close:tooltip is-drawer-close:tooltip-right" data-tip="用户管理" to="/admin/users">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-1.5 inline-block size-4"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span class="is-drawer-close:hidden whitespace-nowrap">用户管理</span>
            </router-link>
          </li>

          <li v-if="isAdmin">
            <router-link active-class="active" exact-active-class="active" class="is-drawer-close:tooltip is-drawer-close:tooltip-right" data-tip="数据备份" to="/admin/backups">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-1.5 inline-block size-4"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6"/></svg>
              <span class="is-drawer-close:hidden whitespace-nowrap">数据备份</span>
            </router-link>
          </li>

          <li>
            <router-link active-class="active" exact-active-class="active" class="is-drawer-close:tooltip is-drawer-close:tooltip-right" data-tip="开源项目" to="/open-source">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-1.5 inline-block size-4"><path d="M16 18 22 12 16 6"/><path d="M8 6 2 12l6 6"/><path d="m14.5 4-5 16"/></svg>
              <span class="is-drawer-close:hidden whitespace-nowrap">开源项目</span>
            </router-link>
          </li>

          <li>
            <router-link active-class="active" exact-active-class="active" class="is-drawer-close:tooltip is-drawer-close:tooltip-right" data-tip="Alert 测试" to="/testpage">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-1.5 inline-block size-4"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M8.21 3.61 2.39 17.02A2 2 0 0 0 4.22 20h15.56a2 2 0 0 0 1.83-2.98L15.79 3.61a2 2 0 0 0-3.58 0Z"/></svg>
              <span class="is-drawer-close:hidden whitespace-nowrap">Alert 测试</span>
            </router-link>
          </li>

          <li>
            <button
              type="button"
              class="is-drawer-close:tooltip is-drawer-close:tooltip-right bg-transparent hover:bg-base-200 focus-visible:bg-base-200"
              data-tip="设置"
              :aria-expanded="settingsMenuOpen"
              aria-controls="settings-submenu"
              @click="toggleSettingsMenu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-1.5 inline-block size-4"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>
              <span class="is-drawer-close:hidden whitespace-nowrap">设置</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="ml-auto size-3.5 transition-transform duration-200 ease-out is-drawer-close:hidden"
                :class="settingsMenuOpen ? 'rotate-90' : 'rotate-0'"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <Transition name="sidebar-submenu">
              <ul v-if="settingsMenuOpen" id="settings-submenu" class="overflow-hidden py-1 is-drawer-close:hidden">
                <li>
                  <router-link class="sidebar-submenu-item" exact-active-class="active" to="/setting">
                    <span class="whitespace-nowrap">常规设置</span>
                  </router-link>
                </li>
                <li v-if="isAdmin">
                  <router-link class="sidebar-submenu-item" exact-active-class="active" to="/setting/scan">
                    <span class="whitespace-nowrap">扫描设置</span>
                  </router-link>
                </li>
                <li v-if="isAdmin">
                  <router-link class="sidebar-submenu-item" exact-active-class="active" to="/admin/tags">
                    <span class="whitespace-nowrap">标签</span>
                  </router-link>
                </li>
                <li v-if="isAdmin">
                  <router-link class="sidebar-submenu-item" exact-active-class="active" to="/setting/maintenance">
                    <span class="whitespace-nowrap">系统维护</span>
                  </router-link>
                </li>
                <li v-if="isAdmin">
                  <router-link class="sidebar-submenu-item" exact-active-class="active" to="/setting/runtime">
                    <span class="whitespace-nowrap">运行时配置</span>
                  </router-link>
                </li>
                <li>
                  <router-link class="sidebar-submenu-item" exact-active-class="active" to="/setting/mail-templates">
                    <span class="whitespace-nowrap">邮件模板</span>
                  </router-link>
                </li>
              </ul>
            </Transition>
          </li>
        </ul>

        <ul v-else class="menu w-full grow">
          <li>
            <router-link active-class="active" exact-active-class="active" class="is-drawer-close:tooltip is-drawer-close:tooltip-right" data-tip="个人信息" to="/user/info">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-1.5 inline-block size-4"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span class="is-drawer-close:hidden whitespace-nowrap">个人信息</span>
            </router-link>
          </li>

          <li>
            <router-link active-class="active" exact-active-class="active" class="is-drawer-close:tooltip is-drawer-close:tooltip-right" data-tip="安全设置" to="/user/security">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-1.5 inline-block size-4"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M6.376 18.91a6 6 0 0 1 11.249.003"/><circle cx="12" cy="11" r="4"/></svg>
              <span class="is-drawer-close:hidden whitespace-nowrap">安全设置</span>
            </router-link>
          </li>
        </ul>

        <div class="w-full is-drawer-close:hidden">
          <div class="divider my-0 px-4 text-xs opacity-60">版本信息</div>
          <div class="flex items-center justify-between px-4 pb-2 text-xs opacity-70">
            <span class="whitespace-nowrap">前端 v{{ frontendVersion }}</span>
            <span class="whitespace-nowrap">服务端 v{{ serverVersion || '—' }}</span>
          </div>
        </div>

        <div class="w-full px-2 pb-2 is-drawer-close:px-1">
          <div class="tabs tabs-box w-full is-drawer-close:flex is-drawer-close:flex-col is-drawer-close:items-center is-drawer-open:grid is-drawer-open:grid-cols-2">
            <button
              type="button"
              class="tab w-full min-w-0 justify-center px-0 is-drawer-close:flex-none"
              :class="{ 'tab-active': activeSettingsTab === 'system' }"
              aria-label="系统设置"
              @click="activeSettingsTab = 'system'"
            >
              <span class="flex min-w-0 items-center justify-center gap-1 overflow-hidden">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>
                <span class="is-drawer-close:hidden whitespace-nowrap">系统设置</span>
              </span>
            </button>
            <button
              type="button"
              class="tab w-full min-w-0 justify-center px-0 is-drawer-close:flex-none"
              :class="{ 'tab-active': activeSettingsTab === 'user' }"
              aria-label="用户设置"
              @click="activeSettingsTab = 'user'"
            >
              <span class="flex min-w-0 items-center justify-center gap-1 overflow-hidden">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span class="is-drawer-close:hidden whitespace-nowrap">用户设置</span>
              </span>
            </button>
          </div>
        </div>

        <div class="w-full border-t border-base-300">
          <ul class="menu w-full">
            <li>
              <button
                class="is-drawer-close:tooltip is-drawer-close:tooltip-right is-drawer-close:justify-center"
                data-tip="Logout"
                :disabled="logoutLoading"
                @click="handleLogout"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-1.5 inline-block size-4">
                  <path d="m16 17 5-5-5-5"/>
                  <path d="M21 12H9"/>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                </svg>
                <span class="is-drawer-close:hidden whitespace-nowrap overflow-hidden text-ellipsis">{{ logoutLoading ? '退出登录中...' : '退出登录' }}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>

  <ReLoginModal ref="reLoginModalRef" />
</template>

<style scoped>
.drawer-side .menu li > a,
.drawer-side .menu li > button {
  min-height: 2.5rem;
}

.sidebar-submenu-enter-active,
.sidebar-submenu-leave-active {
  max-height: 12rem;
  transition:
    max-height 200ms ease-out,
    opacity 160ms ease-out,
    padding 200ms ease-out;
}

.sidebar-submenu-enter-from,
.sidebar-submenu-leave-to {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  opacity: 0;
}

.drawer-side .menu .sidebar-submenu-item {
  width: calc(100% - 1rem);
  margin: 0.125rem 0.5rem;
}
</style>
