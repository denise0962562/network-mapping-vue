<script setup>
import { computed, onMounted, ref } from 'vue'
import { defineAsyncComponent } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import http from '@/utils/http'

const ApexChart = defineAsyncComponent(() => import('vue3-apexcharts'))

const alerts = ref([])
const items = ref([])
const loading = ref(false)
const initialLoadFailed = ref(false)
const hasLoaded = ref(false)
const page = ref(1)
const pageSize = 25
const total = ref(0)
const summary = ref({
  total: 0,
  errors: 0,
  client_errors: 0,
  server_errors: 0,
  error_rate: 0,
  p95_ms: null,
  p99_ms: null,
  error_types: [],
  trend: []
})
const summaryLoading = ref(false)

const windowOptions = [
  { value: '', label: '全部时间' },
  { value: '1h', label: '最近 1 小时' },
  { value: '24h', label: '最近 24 小时' },
  { value: '7d', label: '最近 7 天' }
]

const methodOptions = ['', 'GET', 'POST', 'PUT', 'DELETE', 'HEAD']

const errorTypeLabels = {
  bad_request: '错误请求',
  unauthorized: '未授权',
  forbidden: '禁止访问',
  not_found: '未找到',
  timeout: '超时',
  conflict: '冲突',
  validation: '校验失败',
  rate_limited: '限流',
  client_error: '客户端错误',
  server_error: '服务器错误'
}

const filters = ref({
  window: '24h',
  method: '',
  path: '',
  status: '',
  error_type: '',
  only_errors: false,
  request_id: ''
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const errorRatePercent = computed(() => (Number(summary.value.error_rate) * 100).toFixed(2))

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

function formatDuration(ms) {
  if (ms === null || ms === undefined) return '--'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function statusClass(status) {
  if (status >= 500) return 'badge-error'
  if (status >= 400) return 'badge-warning'
  if (status >= 300) return 'badge-neutral'
  return 'badge-success'
}

function errorTypeLabel(value) {
  return errorTypeLabels[value] || value
}

function windowRange(window) {
  const end = new Date()
  const now = end.getTime()
  if (window === '1h') return { start: new Date(now - 3600_000).toISOString(), end: end.toISOString() }
  if (window === '24h') return { start: new Date(now - 24 * 3600_000).toISOString(), end: end.toISOString() }
  if (window === '7d') return { start: new Date(now - 7 * 24 * 3600_000).toISOString(), end: end.toISOString() }
  return null
}

function buildParams(includePagination = true, includeWindow = false) {
  const params = {}
  for (const key of ['method', 'path', 'status', 'error_type', 'request_id']) {
    if (filters.value[key]) params[key] = filters.value[key]
  }
  if (filters.value.only_errors) params.only_errors = true
  const range = windowRange(filters.value.window)
  if (range) {
    params.start = range.start
    params.end = range.end
  }
  if (includeWindow && filters.value.window) params.window = filters.value.window
  if (includePagination) {
    params.page = page.value
    params.page_size = pageSize
  }
  return params
}

async function loadSummary() {
  summaryLoading.value = true
  try {
    const response = await http.get('/api/requests/summary', { params: buildParams(false, true) })
    if (response.data?.success === true && response.data?.summary) {
      summary.value = response.data.summary
    }
  } catch (error) {
    console.error('load request summary failed', error)
  } finally {
    summaryLoading.value = false
  }
}

async function loadItems() {
  loading.value = true
  try {
    const response = await http.get('/api/requests', { params: buildParams(true, false) })
    items.value = response.data?.items || []
    total.value = Number(response.data?.pagination?.total) || 0
    initialLoadFailed.value = false
    hasLoaded.value = true
  } catch (error) {
    console.error('load requests failed', error)
    if (!hasLoaded.value) {
      items.value = []
      total.value = 0
      initialLoadFailed.value = true
    }
    if (error.response?.status === 403) {
      pushAlert('error', '请求日志加载失败', '只有管理员可以查看请求日志。')
    } else {
      pushAlert('error', '请求日志加载失败', '请检查网络连接或服务器运行状态。')
    }
  } finally {
    loading.value = false
  }
}

async function loadAll() {
  await Promise.all([loadSummary(), loadItems()])
}

function applyFilters() {
  page.value = 1
  loadAll()
}

function resetFilters() {
  filters.value = { window: '24h', method: '', path: '', status: '', error_type: '', only_errors: false, request_id: '' }
  page.value = 1
  loadAll()
}

function changePage(nextPage) {
  if (nextPage < 1 || nextPage > totalPages.value || nextPage === page.value) return
  page.value = nextPage
  loadItems()
}

const trendCategories = computed(() => summary.value.trend.map((point) => point.bucket))
const trendSeries = computed(() => [
  { name: '请求数', data: summary.value.trend.map((point) => point.total), color: '#3b82f6' },
  { name: '4xx 客户端错误', data: summary.value.trend.map((point) => point.client_errors), color: '#f59e0b' },
  { name: '5xx 服务端错误', data: summary.value.trend.map((point) => point.server_errors), color: '#ef4444' }
])
const trendOptions = computed(() => ({
  chart: { type: 'area', toolbar: { show: false }, stacked: false },
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 2 },
  xaxis: {
    type: 'category',
    categories: trendCategories.value,
    labels: {
      formatter: (value) => new Date(value).toLocaleString('zh-CN', { hour12: false })
    }
  },
  yaxis: { labels: { formatter: (value) => Number(value).toLocaleString('zh-CN') } },
  legend: { position: 'top' },
  tooltip: { y: { formatter: (value) => Number(value).toLocaleString('zh-CN') } }
}))

onMounted(loadAll)
</script>

<template>
  <div class="pointer-events-none fixed top-20 left-1/2 z-50 flex w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2 sm:left-auto sm:right-5 sm:w-auto sm:translate-x-0 sm:items-end">
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
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">请求日志</h1>
        <p class="mt-1 text-sm text-base-content/60">查看每一个业务请求，自动识别 4xx / 5xx 错误。</p>
      </div>
    </div>

    <div class="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
      <div class="stat rounded-box border border-base-300 bg-base-100">
        <div class="stat-title">总请求数</div>
        <div class="stat-value text-2xl">{{ Number(summary.total).toLocaleString('zh-CN') }}</div>
      </div>
      <div class="stat rounded-box border border-base-300 bg-base-100">
        <div class="stat-title">错误率</div>
        <div class="stat-value text-2xl" :class="{ 'text-error': Number(summary.error_rate) > 0.05 }">{{ errorRatePercent }}%</div>
        <div class="stat-desc text-xs">错误 {{ Number(summary.errors).toLocaleString('zh-CN') }} 次</div>
      </div>
      <div class="stat rounded-box border border-base-300 bg-base-100">
        <div class="stat-title">P95 耗时</div>
        <div class="stat-value text-2xl">{{ summary.p95_ms === null ? '--' : `${Math.round(summary.p95_ms)} ms` }}</div>
        <div class="stat-desc text-xs">P99 {{ summary.p99_ms === null ? '--' : `${Math.round(summary.p99_ms)} ms` }}</div>
      </div>
      <div class="stat rounded-box border border-base-300 bg-base-100">
        <div class="stat-title">5xx 服务端错误</div>
        <div class="stat-value text-2xl text-error">{{ Number(summary.server_errors).toLocaleString('zh-CN') }}</div>
      </div>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body gap-4 p-4">
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">时间范围</span>
            <select v-model="filters.window" class="select select-bordered w-full">
              <option v-for="option in windowOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">方法</span>
            <select v-model="filters.method" class="select select-bordered w-full">
              <option v-for="method in methodOptions" :key="method" :value="method">{{ method || '全部方法' }}</option>
            </select>
          </label>
          <input v-model.trim="filters.path" class="input input-bordered w-full self-end" placeholder="路径（模糊匹配）" @keyup.enter="applyFilters" />
          <input v-model.trim="filters.status" type="number" class="input input-bordered w-full self-end" placeholder="状态码" @keyup.enter="applyFilters" />
          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">错误类型</span>
            <select v-model="filters.error_type" class="select select-bordered w-full">
              <option value="">全部类型</option>
              <option v-for="(label, value) in errorTypeLabels" :key="value" :value="value">{{ label }}</option>
            </select>
          </label>
          <input v-model.trim="filters.request_id" class="input input-bordered w-full self-end" placeholder="请求 ID (UUID)" @keyup.enter="applyFilters" />
          <label class="flex cursor-pointer items-center gap-2 self-end pb-3">
            <input v-model="filters.only_errors" type="checkbox" class="checkbox checkbox-sm" />
            <span class="text-sm">仅看错误</span>
          </label>
        </div>
        <div class="flex justify-end gap-2">
          <button class="btn btn-ghost btn-sm" :disabled="loading || summaryLoading" @click="resetFilters">重置</button>
          <button class="btn btn-neutral btn-sm" :disabled="loading || summaryLoading" @click="applyFilters">查询</button>
        </div>
      </div>
    </div>

    <section class="card mt-5 border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="font-semibold">请求与错误趋势</h2>
            <p class="mt-1 text-xs text-base-content/60">按时间分桶统计请求量，并分别展示 4xx 与 5xx 错误。</p>
          </div>
          <span v-if="summaryLoading" class="loading loading-spinner loading-sm"></span>
        </div>
        <div v-if="summaryLoading && !summary.trend.length" class="mt-4 skeleton h-72 w-full rounded-box"></div>
        <EmptyState v-else-if="!summary.trend.length" class="mt-4" title="暂无趋势数据" message="当前筛选范围内没有请求记录。" />
        <div v-else class="relative mt-2">
          <ApexChart type="area" height="300" :options="trendOptions" :series="trendSeries" />
        </div>
      </div>
    </section>

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
      <EmptyState v-else-if="items.length === 0" title="暂无请求记录" message="当前筛选条件下没有可显示的记录。" />
      <div v-else-if="items.length" class="overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>时间</th>
              <th>方法</th>
              <th>路径</th>
              <th>状态</th>
              <th>耗时</th>
              <th>来源 IP</th>
              <th>操作者</th>
              <th>请求 ID</th>
              <th>错误类型</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td class="whitespace-nowrap text-xs">{{ formatTime(item.occurred_at) }}</td>
              <td><span class="badge badge-outline badge-sm font-mono">{{ item.http_method }}</span></td>
              <td class="max-w-64 truncate" :title="item.request_path">{{ item.request_path }}</td>
              <td><span class="badge badge-sm" :class="statusClass(item.status_code)">{{ item.status_code }}</span></td>
              <td class="font-mono text-xs">{{ formatDuration(item.duration_ms) }}</td>
              <td class="font-mono text-xs">{{ item.client_ip || '--' }}</td>
              <td>{{ item.actor_name || '--' }}</td>
              <td class="max-w-48">
                <span class="truncate font-mono text-xs" :title="item.request_id">{{ item.request_id }}</span>
              </td>
              <td>
                <span v-if="item.error_type" class="badge badge-sm" :class="{ 'badge-error': item.error_level === 'server_error', 'badge-warning': item.error_level === 'client_error' }">
                  {{ errorTypeLabel(item.error_type) }}
                </span>
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
