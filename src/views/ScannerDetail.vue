<script setup>
import { formatDateTime as formatSystemDateTime } from '@/utils/systemTime'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/EmptyState.vue'
import VersionUpdateBadge from '@/components/VersionUpdateBadge.vue'
import ScannerLatencyChart from '@/components/ScannerLatencyChart.vue'
import ScannerDiagnostics from '@/components/ScannerDiagnostics.vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import http from '@/utils/http'

const route = useRoute()
const router = useRouter()
const scannerId = computed(() => String(route.params.id || ''))

const scannerDetail = ref(null)
const isLoading = ref(false)
const loadFailed = ref(false)
const notFound = ref(false)
const actionLoading = ref(false)
const actionMessage = ref('')
const registrationSecret = ref(null)
const editForm = ref({ name: '', location: '', tag: '', remark: '' })
const hasUnsavedChanges = computed(() => {
  if (!scannerDetail.value) return false
  return editForm.value.name !== (scannerDetail.value.name || '')
    || editForm.value.location !== (scannerDetail.value.location || '')
    || editForm.value.tag !== (scannerDetail.value.tag || '')
    || editForm.value.remark !== (scannerDetail.value.remark || '')
})

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return formatSystemDateTime(date)
}

function formatUptime(value) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0) return '-'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${days} 天 ${hours} 小时 ${minutes} 分钟`
}

function formatRam(value) {
  const megabytes = Number(value)
  if (!Number.isFinite(megabytes) || megabytes < 0) return '-'
  if (megabytes >= 1024) return `${(megabytes / 1024).toFixed(1)} GB`
  return `${megabytes} MB`
}

function formatLatency(value) {
  const milliseconds = Number(value)
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '--'
  if (milliseconds < 10) return `${milliseconds.toFixed(1)} ms`
  return `${Math.round(milliseconds)} ms`
}

function latencyBadge(latency) {
  if (!latency || latency.stale) return 'badge-ghost'
  if (latency.severity === 'critical') return 'badge-error'
  if (latency.severity === 'warning') return 'badge-warning'
  return 'badge-success'
}

const scannerStatus = computed(() => {
  const scanner = scannerDetail.value
  if (!scanner || scanner.is_enable !== true) return { text: '待注册', class: 'badge-warning' }
  if (scanner.is_online === true && scanner.runtime_state === 'scanning') {
    return { text: '扫描中', class: 'badge-info' }
  }
  if (scanner.is_online === true) return { text: '在线 · 空闲', class: 'badge-success' }
  return { text: '离线', class: 'badge-error' }
})

async function loadScanner({ silent = false } = {}) {
  if (!scannerId.value) return
  if (!silent) isLoading.value = true
  if (!silent) {
    loadFailed.value = false
    notFound.value = false
    scannerDetail.value = null
  }

  try {
    const response = await http.get(`/api/scanner/${scannerId.value}`)
    if (response.data?.success !== true || !response.data?.data) {
      throw new Error('服务器未返回有效扫描器信息')
    }
    scannerDetail.value = response.data.data
    if (!silent) {
      editForm.value = {
        name: scannerDetail.value.name || '',
        location: scannerDetail.value.location || '',
        tag: scannerDetail.value.tag || '',
        remark: scannerDetail.value.remark || ''
      }
    }
  } catch (error) {
    console.error('load scanner detail failed', error)
    if (!silent) {
      notFound.value = error?.response?.status === 404
      loadFailed.value = !notFound.value
    }
  } finally {
    isLoading.value = false
  }
}

async function runAction(action, successMessage) {
  actionLoading.value = true
  actionMessage.value = ''
  try {
    await action()
    actionMessage.value = successMessage
    await loadScanner({ silent: true })
    return true
  } catch (error) {
    console.error('scanner action failed', error)
    actionMessage.value = error?.response?.status === 403 ? '仅管理员可以执行此操作' : '操作失败，请稍后重试'
    return false
  } finally {
    actionLoading.value = false
  }
}

async function saveScanner() {
  if (!editForm.value.name.trim()) return false
  const normalizedName = editForm.value.name.trim()
  const saved = await runAction(() => http.put(`/api/scanner/${scannerId.value}`, {
    ...editForm.value,
    name: normalizedName
  }), '扫描器信息已更新')
  if (saved) editForm.value.name = normalizedName
  return saved
}

const { allowNextRouteLeave } = useUnsavedChanges(hasUnsavedChanges, saveScanner)

function toggleScanner() {
  const enabled = scannerDetail.value?.is_enable !== true
  return runAction(() => http.post(`/api/scanner/${scannerId.value}/enabled`, { enabled }), enabled ? '扫描器已启用' : '扫描器已禁用，运行任务已释放')
}

async function reissueToken() {
  if (!window.confirm('重签凭据会立即废止当前运行 Token，确定继续吗？')) return
  actionLoading.value = true
  actionMessage.value = ''
  try {
    const response = await http.post(`/api/scanner/${scannerId.value}/reissue-token`)
    registrationSecret.value = response.data?.data || null
    actionMessage.value = '新注册凭据已生成，请立即保存'
    await loadScanner({ silent: true })
  } catch (error) {
    actionMessage.value = error?.response?.status === 403 ? '仅管理员可以执行此操作' : '凭据重签失败'
  } finally {
    actionLoading.value = false
  }
}

async function deleteScanner() {
  if (!window.confirm('确定删除该扫描器吗？历史任务和结果会保留。')) return
  actionLoading.value = true
  try {
    await http.delete(`/api/scanner/${scannerId.value}`)
    allowNextRouteLeave()
    await router.push('/scanner')
  } catch (error) {
    actionMessage.value = error?.response?.status === 403 ? '仅管理员可以执行此操作' : '删除扫描器失败'
    actionLoading.value = false
  }
}

let refreshTimer

watch(scannerId, () => {
  loadScanner()
  window.clearInterval(refreshTimer)
  refreshTimer = window.setInterval(() => loadScanner({ silent: true }), 30000)
}, { immediate: true })

onBeforeUnmount(() => window.clearInterval(refreshTimer))
</script>

<template>
  <div class="page-shell">
    <div class="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row">
      <div>
        <h1 class="page-title">{{ scannerDetail?.name || '扫描器详情' }}</h1>
        <p class="text-sm opacity-80 mt-1">ID：{{ scannerId }}</p>
        <p v-if="scannerDetail" class="text-sm opacity-80 mt-1">位置：{{ scannerDetail.location || '无' }}</p>
      </div>
      <router-link to="/scanner" class="btn btn-ghost btn-sm">返回列表</router-link>
    </div>

    <div v-if="isLoading" class="grid min-h-80 place-items-center rounded-lg bg-base-200/60">
      <span class="loading loading-spinner loading-md"></span>
    </div>

    <EmptyState
      v-else-if="notFound"
      type="error"
      title="扫描器不存在"
      message="该扫描器可能已被删除，或链接中的 ID 无效。"
    />

    <EmptyState
      v-else-if="loadFailed"
      type="error"
      title="扫描器详情加载失败"
      message="无法从服务器获取扫描器信息，请稍后重试。"
    />

    <div v-else-if="scannerDetail" class="space-y-5">
      <div v-if="actionMessage" role="alert" class="alert alert-info"><span>{{ actionMessage }}</span></div>

      <section class="card bg-base-100 card-border border-base-300 p-4">
        <h3 class="font-semibold mb-3">基本信息</h3>
        <div class="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">名称：</span>{{ scannerDetail.name || '未命名扫描器' }}</div>
          <div class="rounded-lg bg-base-200/60 p-3 break-all"><span class="opacity-70">ID：</span>{{ scannerDetail.scanner_id }}</div>
          <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">位置：</span>{{ scannerDetail.location || '-' }}</div>
          <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">IP：</span>{{ scannerDetail.ip_address || '-' }}</div>
          <div class="rounded-lg bg-base-200/60 p-3">
            <span class="opacity-70">状态：</span>
            <span class="badge badge-sm" :class="scannerStatus.class">{{ scannerStatus.text }}</span>
          </div>
          <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">创建者：</span>{{ scannerDetail.creator || '-' }}</div>
          <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">创建时间：</span>{{ formatDate(scannerDetail.create_time) }}</div>
          <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">注册时间：</span>{{ formatDate(scannerDetail.register_time) }}</div>
          <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">更新时间：</span>{{ formatDate(scannerDetail.update_time) }}</div>
          <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">最后心跳：</span>{{ formatDate(scannerDetail.last_seen_at) }}</div>
          <div class="rounded-lg bg-base-200/60 p-3">
            <span class="opacity-70">当前任务：</span>
            <router-link v-if="scannerDetail.current_task_id" class="link link-neutral" :to="`/task/${scannerDetail.current_task_id}`">
              {{ scannerDetail.current_task_id }}
            </router-link>
            <span v-else>-</span>
          </div>
          <div class="rounded-lg bg-base-200/60 p-3">
            <div class="flex flex-wrap items-center gap-2">
              <div><span class="opacity-70">扫描器版本：</span>{{ scannerDetail.scanner_version || '-' }}</div>
              <VersionUpdateBadge component="scanner" :current-version="scannerDetail.scanner_version || ''" />
            </div>
          </div>
          <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">标签：</span>{{ scannerDetail.tag || '-' }}</div>
          <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">备注：</span>{{ scannerDetail.remark || '-' }}</div>
        </div>
      </section>

      <div class="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        <section class="min-w-0 space-y-5 xl:col-span-2">
          <ScannerLatencyChart :scanner-id="scannerId" />
          <ScannerDiagnostics :scanner="scannerDetail" />

          <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div class="card bg-base-100 card-border border-base-300 p-4">
              <h3 class="font-semibold mb-3">运行环境</h3>
              <div class="grid grid-cols-1 gap-3 text-sm">
                <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">系统版本：</span>{{ scannerDetail.system_version || '-' }}</div>
                <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">CPU 型号：</span>{{ scannerDetail.cpu_model || '-' }}</div>
                <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">CPU 核心数：</span>{{ scannerDetail.cpus ?? '-' }}</div>
                <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">RAM：</span>{{ formatRam(scannerDetail.ram) }}</div>
                <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">运行时间：</span>{{ formatUptime(scannerDetail.uptime) }}</div>
              </div>
            </div>

            <div class="card bg-base-100 card-border border-base-300 p-4">
              <h3 class="font-semibold mb-3">网络协议探测</h3>
              <div class="space-y-3 text-sm">
                <div class="rounded-lg bg-base-200/60 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-medium">IPv4</span>
                    <span class="badge badge-sm" :class="scannerDetail.supports_ipv4 && scannerDetail.ipv4_ready ? 'badge-success' : 'badge-ghost'">
                      {{ scannerDetail.supports_ipv4 && scannerDetail.ipv4_ready ? '可用' : '不可用' }}
                    </span>
                  </div>
                  <div class="mt-2 break-all text-xs opacity-70">公网地址：{{ scannerDetail.public_ipv4 || '-' }}</div>
                  <div v-if="scannerDetail.network_status_reason?.ipv4" class="mt-1 break-all text-xs text-warning">{{ scannerDetail.network_status_reason.ipv4 }}</div>
                </div>
                <div class="rounded-lg bg-base-200/60 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-medium">IPv6</span>
                    <span class="badge badge-sm" :class="scannerDetail.supports_ipv6 && scannerDetail.ipv6_ready ? 'badge-success' : 'badge-ghost'">
                      {{ scannerDetail.supports_ipv6 && scannerDetail.ipv6_ready ? '可用' : '不可用' }}
                    </span>
                  </div>
                  <div class="mt-2 break-all text-xs opacity-70">公网地址：{{ scannerDetail.public_ipv6 || '-' }}</div>
                  <div v-if="scannerDetail.network_status_reason?.ipv6" class="mt-1 break-all text-xs text-warning">{{ scannerDetail.network_status_reason.ipv6 }}</div>
                </div>
                <div class="text-xs opacity-60">检测时间：{{ formatDate(scannerDetail.network_capabilities_updated_at) }}</div>
              </div>
            </div>
          </div>
        </section>

        <aside class="min-w-0 space-y-5 xl:col-span-1">
          <div class="card bg-base-100 card-border border-base-300 p-4">
            <h3 class="font-semibold mb-3">服务端通信</h3>
            <div v-if="scannerDetail.latency" class="space-y-3 text-sm">
              <div class="flex items-center justify-between rounded-lg bg-base-200/60 p-3">
                <span class="opacity-70">估算网络 RTT</span>
                <span class="badge" :class="latencyBadge(scannerDetail.latency)">
                  {{ formatLatency(scannerDetail.latency.network_rtt_ms) }}
                </span>
              </div>
              <div class="rounded-lg bg-base-200/60 p-3">
                <div><span class="opacity-70">HTTPS 总 RTT：</span>{{ formatLatency(scannerDetail.latency.rtt_ms) }}</div>
                <div class="mt-2"><span class="opacity-70">服务端处理：</span>{{ formatLatency(scannerDetail.latency.server_processing_ms) }}</div>
              </div>
              <div class="text-xs" :class="scannerDetail.latency.stale ? 'text-warning' : 'opacity-60'">
                {{ scannerDetail.latency.stale ? '样本已过期 · ' : '测量时间：' }}{{ formatDate(scannerDetail.latency.measured_at) }}
              </div>
            </div>
            <div v-else class="rounded-lg bg-base-200/60 p-3 text-sm opacity-60">
              暂无样本；升级扫描器并完成两个心跳周期后开始上报。
            </div>
          </div>

          <div class="card bg-base-100 card-border border-base-300 p-4">
            <h3 class="font-semibold mb-3">扫描器管理</h3>
            <div class="grid gap-3">
              <router-link :to="{ name: 'scanner-configuration', params: { id: scannerId } }" class="btn btn-outline">
                扫描配置
              </router-link>
              <input v-model="editForm.name" class="input input-bordered w-full" placeholder="名称" :disabled="actionLoading" />
              <input v-model="editForm.location" class="input input-bordered w-full" placeholder="位置" :disabled="actionLoading" />
              <input v-model="editForm.tag" class="input input-bordered w-full" placeholder="标签" :disabled="actionLoading" />
              <fieldset class="fieldset min-w-0 w-full">
                <legend class="fieldset-legend"><label for="scanner-detail-remark">备注</label></legend>
                <textarea id="scanner-detail-remark" v-model="editForm.remark" class="textarea textarea-bordered w-full" placeholder="备注" :disabled="actionLoading"></textarea>
              </fieldset>
              <button class="btn btn-neutral" :disabled="actionLoading || !editForm.name.trim()" @click="saveScanner">保存信息</button>
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <button class="btn btn-outline" :disabled="actionLoading" @click="toggleScanner">{{ scannerDetail.is_enable ? '禁用' : '启用' }}</button>
                <button class="btn btn-outline" :disabled="actionLoading" @click="reissueToken">重签凭据</button>
              </div>
              <button class="btn btn-error btn-outline" :disabled="actionLoading" @click="deleteScanner">删除扫描器</button>
            </div>
            <div v-if="registrationSecret" class="mt-4 rounded-box border border-warning bg-warning/10 p-3 text-sm">
              <p class="font-medium">一次性注册凭据</p>
              <p class="mt-2 break-all text-xs">ID：{{ registrationSecret.scanner_id }}</p>
              <p class="mt-1 break-all text-xs">Token：{{ registrationSecret.registration_token }}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>
