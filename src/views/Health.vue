<script setup>
import { computed, onMounted, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import http from '@/utils/http'

const alerts = ref([])
const items = ref([])
const loading = ref(false)
const initialLoadFailed = ref(false)
const hasLoaded = ref(false)
const page = ref(1)
const pageSize = 25
const total = ref(0)

const windowOptions = [
  { value: '', label: '全部时间' },
  { value: '1h', label: '最近 1 小时' },
  { value: '24h', label: '最近 24 小时' },
  { value: '7d', label: '最近 7 天' }
]

const alertTypeOptions = [
  { value: '', label: '全部类型' },
  { value: 'slow_request', label: '慢请求' },
  { value: 'server_error', label: '服务端错误' },
  { value: 'slow_sql', label: '慢 SQL' }
]

const severityOptions = [
  { value: '', label: '全部级别' },
  { value: 'warning', label: '警告' },
  { value: 'critical', label: '严重' }
]

const alertTypeLabels = {
  slow_request: '慢请求',
  server_error: '服务端错误',
  slow_sql: '慢 SQL'
}

const severityLabels = {
  warning: '警告',
  critical: '严重'
}

const filters = ref({
  window: '24h',
  alert_type: '',
  severity: ''
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

function pushAlert(type, title, description = '', timeout = 7000) {
  alerts.value.unshift({ id: crypto.randomUUID(), type, title, description, timeout })
}

function closeAlert(id) {
  alerts.value = alerts.value.filter((alert) => alert.id !== id)
}

function formatTime(value) {
  if (!value) return '--'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function windowRange(window) {
  const end = new Date()
  const now = end.getTime()
  if (window === '1h') return { start: new Date(now - 3600_000).toISOString(), end: end.toISOString() }
  if (window === '24h') return { start: new Date(now - 24 * 3600_000).toISOString(), end: end.toISOString() }
  if (window === '7d') return { start: new Date(now - 7 * 24 * 3600_000).toISOString(), end: end.toISOString() }
  return null
}

function alertTypeLabel(value) {
  return alertTypeLabels[value] || value
}

function severityLabel(value) {
  return severityLabels[value] || value
}

function severityClass(value) {
  return value === 'critical' ? 'badge-error' : 'badge-warning'
}

function detailItems(item) {
  return item?.detail?.details || []
}

function buildParams() {
  const params = {}
  if (filters.value.alert_type) params.alert_type = filters.value.alert_type
  if (filters.value.severity) params.severity = filters.value.severity
  const range = windowRange(filters.value.window)
  if (range) {
    params.start = range.start
    params.end = range.end
  }
  params.page = page.value
  params.page_size = pageSize
  return params
}

async function loadItems() {
  loading.value = true
  try {
    const response = await http.get('/api/health/alerts', { params: buildParams() })
    items.value = response.data?.items || []
    total.value = Number(response.data?.pagination?.total) || 0
    initialLoadFailed.value = false
    hasLoaded.value = true
  } catch (error) {
    console.error('load health alerts failed', error)
    if (!hasLoaded.value) {
      items.value = []
      total.value = 0
      initialLoadFailed.value = true
    }
    if (error.response?.status === 403) {
      pushAlert('error', '健康告警加载失败', '只有管理员可以查看健康告警。')
    } else {
      pushAlert('error', '健康告警加载失败', '请检查网络连接或服务器运行状态。')
    }
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  loadItems()
}

function resetFilters() {
  filters.value = { window: '24h', alert_type: '', severity: '' }
  page.value = 1
  loadItems()
}

function changePage(nextPage) {
  if (nextPage < 1 || nextPage > totalPages.value || nextPage === page.value) return
  page.value = nextPage
  loadItems()
}

onMounted(loadItems)
</script>

<template>
  <div class="pointer-events-none fixed right-4 top-20 z-50 flex w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:w-auto">
    <AppAlert
      v-for="alert in alerts"
      :key="alert.id"
      class="pointer-events-auto"
      :type="alert.type"
      :title="alert.title"
      :description="alert.description"
      :timeout="alert.timeout"
      @close="closeAlert(alert.id)"
    />
  </div>

  <main class="p-4 md:p-6">
    <div class="mb-4">
      <h1 class="text-2xl font-semibold">健康告警</h1>
      <p class="mt-1 text-sm text-base-content/60">慢请求、5xx 错误与慢 SQL 的告警历史。</p>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body gap-4 p-4">
        <div class="grid gap-3 md:grid-cols-3">
          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">时间范围</span>
            <select v-model="filters.window" class="select select-bordered w-full">
              <option v-for="option in windowOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">告警类型</span>
            <select v-model="filters.alert_type" class="select select-bordered w-full">
              <option v-for="option in alertTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">级别</span>
            <select v-model="filters.severity" class="select select-bordered w-full">
              <option v-for="option in severityOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
        </div>
        <div class="flex justify-end gap-2">
          <button class="btn btn-ghost btn-sm" :disabled="loading" @click="resetFilters">重置</button>
          <button class="btn btn-neutral btn-sm" :disabled="loading" @click="applyFilters">查询</button>
        </div>
      </div>
    </div>

    <div class="mt-4 overflow-hidden rounded-box border border-base-300 bg-base-100">
      <div v-if="loading" class="space-y-3 p-5">
        <div class="skeleton h-72 w-full rounded-box"></div>
        <div class="skeleton h-4 w-52"></div>
      </div>
      <EmptyState
        v-else-if="initialLoadFailed"
        type="error"
        title="加载数据失败"
        :message="'这通常是由于客户端与服务器的网络不可达或服务器崩溃了\n请检查您的网络，并测试是否可以正常访问服务器，如果上述一切正常，请联系系统管理员'"
      />
      <EmptyState v-else-if="items.length === 0" title="暂无健康告警" message="当前筛选条件下没有可显示的告警记录。" />
      <div v-else-if="items.length" class="overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>时间</th>
              <th>类型</th>
              <th>级别</th>
              <th>摘要</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td class="whitespace-nowrap text-xs">{{ formatTime(item.occurred_at) }}</td>
              <td><span class="badge badge-outline badge-sm">{{ alertTypeLabel(item.alert_type) }}</span></td>
              <td><span class="badge badge-sm" :class="severityClass(item.severity)">{{ severityLabel(item.severity) }}</span></td>
              <td class="max-w-72">{{ item.summary }}</td>
              <td class="max-w-96">
                <ul v-if="detailItems(item).length" class="space-y-0.5 text-xs">
                  <li v-for="(detail, index) in detailItems(item)" :key="index" class="truncate" :title="`${detail.label}: ${detail.value}`">
                    <span class="text-base-content/50">{{ detail.label }}：</span>{{ detail.value }}
                  </li>
                </ul>
                <span v-else class="text-base-content/40">--</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="items.length" class="mt-4 flex items-center justify-between text-sm">
      <span class="text-base-content/60">共 {{ total }} 条，第 {{ page }} / {{ totalPages }} 页</span>
      <div class="join">
        <button class="btn btn-sm join-item" :disabled="page <= 1 || loading" @click="changePage(page - 1)">上一页</button>
        <button class="btn btn-sm join-item" :disabled="page >= totalPages || loading" @click="changePage(page + 1)">下一页</button>
      </div>
    </div>
  </main>
</template>
