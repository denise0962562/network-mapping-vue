<script setup>
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppAlert from '@/components/AppAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import SystemMaintenanceTooltip from '@/components/SystemMaintenanceTooltip.vue'
import { formatChartTooltipTime, renderChartTooltip } from '@/utils/chartTooltip'
import http from '@/utils/http'
import { buildSystemMaintenanceAnnotations, loadSystemMaintenanceHistory, useSystemMaintenanceAnnotations } from '@/utils/systemMaintenanceAnnotations'

const ApexChart = defineAsyncComponent(() => import('vue3-apexcharts/core'))
const router = useRouter()

const windowOptions = [
  { value: '1h', label: '最近 1 小时', seconds: 3600 },
  { value: '24h', label: '最近 24 小时', seconds: 86400 },
  { value: '7d', label: '最近 7 天', seconds: 604800 },
]
const granularityOptions = [
  { value: 'auto', label: '自动', seconds: null },
  { value: '1m', label: '1 分钟', seconds: 60 },
  { value: '5m', label: '5 分钟', seconds: 300 },
  { value: '15m', label: '15 分钟', seconds: 900 },
  { value: '30m', label: '30 分钟', seconds: 1800 },
  { value: '1h', label: '1 小时', seconds: 3600 },
  { value: '2h', label: '2 小时', seconds: 7200 },
  { value: '6h', label: '6 小时', seconds: 21600 },
]
const methodOptions = ['', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']
const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'success', label: '成功与重定向' },
  { value: '4xx', label: '4xx 客户端错误' },
  { value: '5xx', label: '5xx 服务端错误' },
]

const filters = ref({ window: '24h', granularity: 'auto', method: '', route: '', status_class: '' })
const alerts = ref([])
const loading = ref(false)
const hasLoaded = ref(false)
const loadFailed = ref(false)
const summary = ref(emptySummary())
const baseline = ref(emptySummary())
const changes = ref({})
const trend = ref([])
const baselineTrend = ref([])
const events = ref([])
const meta = ref({})
const { maintenanceAnnotations, maintenanceChartRef, maintenanceTooltip, showMaintenanceTooltip, hideMaintenanceTooltip, applyMaintenanceAnnotations } = useSystemMaintenanceAnnotations()

function emptySummary() {
  return {
    sample_count: 0,
    avg_ms: null,
    p50_ms: null,
    p95_ms: null,
    p99_ms: null,
    max_ms: null,
    error_rate: 0,
    slow_rate: 0,
    normalized_coverage: 1,
  }
}

function pushAlert(type, title, description = '', timeout = 7000) {
  alerts.value.unshift({ id: crypto.randomUUID(), type, title, description, timeout })
}

function closeAlert(id) {
  alerts.value = alerts.value.filter((alert) => alert.id !== id)
}

function formatDuration(value) {
  if (value === null || value === undefined) return '--'
  const ms = Number(value)
  if (!Number.isFinite(ms)) return '--'
  if (ms < 1) return `${ms.toFixed(3)} ms`
  if (ms < 100) return `${ms.toFixed(2)} ms`
  if (ms < 1000) return `${ms.toFixed(1)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function formatRate(value) {
  const rate = Number(value)
  return Number.isFinite(rate) ? `${(rate * 100).toFixed(2)}%` : '--'
}

function deltaLabel(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '暂无基线'
  const rate = Number(value) * 100
  return `${rate > 0 ? '+' : ''}${rate.toFixed(1)}%`
}

function deltaClass(value) {
  if (value === null || value === undefined) return 'text-base-content/50'
  const rate = Number(value)
  if (!Number.isFinite(rate)) return 'text-base-content/50'
  if (rate > 0.2) return 'text-error'
  if (rate > 0) return 'text-warning'
  if (rate < 0) return 'text-success'
  return 'text-base-content/60'
}

function granularityDisabled(option) {
  if (!option.seconds) return false
  const window = windowOptions.find((item) => item.value === filters.value.window)
  return window ? Math.ceil(window.seconds / option.seconds) > 1500 : false
}

function ensureValidGranularity() {
  const option = granularityOptions.find((item) => item.value === filters.value.granularity)
  if (option && granularityDisabled(option)) filters.value.granularity = 'auto'
}

async function loadPerformance() {
  loading.value = true
  try {
    const params = {}
    for (const key of ['window', 'granularity', 'method', 'route', 'status_class']) {
      if (filters.value[key]) params[key] = filters.value[key]
    }
    const response = await http.get('/api/requests/performance', { params })
    if (response.data?.success !== true) throw new Error('服务器未返回有效的性能数据')
    summary.value = { ...emptySummary(), ...(response.data.summary || {}) }
    baseline.value = { ...emptySummary(), ...(response.data.baseline || {}) }
    changes.value = response.data.changes || {}
    trend.value = response.data.trend || []
    baselineTrend.value = response.data.baseline_trend || []
    events.value = response.data.events || []
    meta.value = response.data.meta || {}
    const windowSeconds = windowOptions.find((item) => item.value === filters.value.window)?.seconds || 0
    const endAt = new Date()
    const history = await loadSystemMaintenanceHistory()
    maintenanceAnnotations.value = buildSystemMaintenanceAnnotations(history, {
      startAt: windowSeconds ? new Date(endAt.getTime() - windowSeconds * 1000) : trend.value.at(0)?.bucket,
      endAt,
      onLabelMouseEnter: showMaintenanceTooltip,
      onLabelMouseLeave: hideMaintenanceTooltip
    })
    hasLoaded.value = true
    loadFailed.value = false
  } catch (error) {
    console.error('load request performance failed', error)
    if (!hasLoaded.value) loadFailed.value = true
    if (error.response?.status === 403) {
      pushAlert('error', '性能基线加载失败', '只有管理员可以查看请求性能数据。')
    } else {
      pushAlert('error', '性能基线加载失败', '请检查网络连接或服务器运行状态。')
    }
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.value = { window: '24h', granularity: 'auto', method: '', route: '', status_class: '' }
  loadPerformance()
}

function requestPathPrefix(pattern) {
  if (!pattern || pattern === '（历史未标准化）') return ''
  const prefix = pattern.split('{')[0].replace(/\/$/, '')
  return prefix || pattern
}

function viewRequestLogs(event) {
  const query = { window: filters.value.window, method: event.method }
  const path = requestPathPrefix(event.route_pattern)
  if (path) query.path = path
  router.push({ path: '/requests', query })
}

const granularityLabel = computed(() => {
  const value = meta.value.granularity
  return granularityOptions.find((item) => item.value === value)?.label || value || ''
})

const normalizedCoverage = computed(() => Number(summary.value.normalized_coverage || 0))
const summaryHasBaseline = computed(() => Number(summary.value.sample_count) >= 20 && Number(baseline.value.sample_count) >= 20)

const trendSeries = computed(() => {
  const shiftMilliseconds = Number(meta.value.comparison_shift_seconds || 0) * 1000
  return [
    { name: '当前 P50', data: trend.value.map((point) => ({ x: point.bucket, y: point.p50_ms })) },
    { name: '当前 P95', data: trend.value.map((point) => ({ x: point.bucket, y: point.p95_ms })) },
    { name: '当前 P99', data: trend.value.map((point) => ({ x: point.bucket, y: point.p99_ms })) },
    {
      name: '上一周期 P95',
      data: baselineTrend.value.map((point) => ({
        x: new Date(new Date(point.bucket).getTime() + shiftMilliseconds).toISOString(),
        y: point.p95_ms,
      })),
    },
  ]
})

const trendOptions = computed(() => ({
  chart: { type: 'line', toolbar: { show: false }, animations: { enabled: true } },
  colors: ['#3b82f6', '#8b5cf6', '#ef4444', '#94a3b8'],
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: [2, 2.5, 2, 2], dashArray: [0, 0, 0, 6] },
  xaxis: { type: 'datetime', labels: { datetimeUTC: false } },
  yaxis: { min: 0, labels: { formatter: (value) => formatDuration(value) } },
  legend: { position: 'top' },
  tooltip: {
    shared: true,
    intersect: false,
    custom({ series, seriesIndex, dataPointIndex, w }) {
      const timestamp = w.globals.seriesX[seriesIndex]?.[dataPointIndex]
      return renderChartTooltip({
        title: formatChartTooltipTime(timestamp),
        rows: series
          .map((values, index) => ({
            label: w.globals.seriesNames[index],
            value: formatDuration(values[dataPointIndex]),
            color: w.globals.colors[index]
          }))
          .filter((row) => row.value !== '--')
      })
    }
  },
  noData: { text: '暂无趋势数据' },
}))

onMounted(loadPerformance)
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
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">请求性能基线</h1>
        <p class="mt-1 text-sm text-base-content/60">按请求事件分析服务端处理耗时，并与上一等长周期比较。</p>
      </div>
      <span class="text-xs text-base-content/50">计时包含中间件与业务处理，不包含客户端网络传输</span>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body gap-4 p-4">
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">时间范围</span>
            <select v-model="filters.window" class="select select-bordered w-full" @change="ensureValidGranularity">
              <option v-for="option in windowOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">时间粒度</span>
            <select v-model="filters.granularity" class="select select-bordered w-full">
              <option v-for="option in granularityOptions" :key="option.value" :value="option.value" :disabled="granularityDisabled(option)">
                {{ option.label }}
              </option>
            </select>
          </label>
          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">请求方法</span>
            <select v-model="filters.method" class="select select-bordered w-full">
              <option v-for="method in methodOptions" :key="method" :value="method">{{ method || '全部方法' }}</option>
            </select>
          </label>
          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">状态类别</span>
            <select v-model="filters.status_class" class="select select-bordered w-full">
              <option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">事件路由</span>
            <input v-model.trim="filters.route" class="input input-bordered w-full" placeholder="例如 /api/task" @keyup.enter="loadPerformance" />
          </label>
        </div>
        <div class="flex justify-end gap-2">
          <button class="btn btn-ghost btn-sm" :disabled="loading" @click="resetFilters">重置</button>
          <button class="btn btn-neutral btn-sm" :disabled="loading" @click="loadPerformance">
            <span v-if="loading" class="loading loading-spinner loading-xs"></span>
            {{ loading ? '查询中…' : '应用筛选' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading && !hasLoaded" class="mt-5 space-y-4">
      <div class="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <div v-for="index in 5" :key="index" class="skeleton h-28 rounded-box"></div>
      </div>
      <div class="skeleton h-80 rounded-box"></div>
    </div>

    <EmptyState
      v-else-if="loadFailed && !hasLoaded"
      class="mt-5"
      type="error"
      title="性能基线加载失败"
      message="无法从服务器获取请求性能数据，请确认当前账号权限及服务器运行状态。"
    />

    <template v-else>
      <div class="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-5">
        <div class="stat rounded-box border border-base-300 bg-base-100">
          <div class="stat-title">性能样本</div>
          <div class="stat-value text-2xl">{{ Number(summary.sample_count).toLocaleString('zh-CN') }}</div>
          <div class="stat-desc">上一周期 {{ Number(baseline.sample_count).toLocaleString('zh-CN') }}</div>
        </div>
        <div class="stat rounded-box border border-base-300 bg-base-100">
          <div class="stat-title">P50</div>
          <div class="stat-value text-2xl">{{ formatDuration(summary.p50_ms) }}</div>
          <div class="stat-desc" :class="deltaClass(changes.p50_delta_rate)">{{ summaryHasBaseline ? deltaLabel(changes.p50_delta_rate) : '基线样本不足' }}</div>
        </div>
        <div class="stat rounded-box border border-base-300 bg-base-100">
          <div class="stat-title">P95</div>
          <div class="stat-value text-2xl">{{ formatDuration(summary.p95_ms) }}</div>
          <div class="stat-desc" :class="deltaClass(changes.p95_delta_rate)">{{ summaryHasBaseline ? deltaLabel(changes.p95_delta_rate) : '基线样本不足' }}</div>
        </div>
        <div class="stat rounded-box border border-base-300 bg-base-100">
          <div class="stat-title">P99</div>
          <div class="stat-value text-2xl">{{ formatDuration(summary.p99_ms) }}</div>
          <div class="stat-desc" :class="deltaClass(changes.p99_delta_rate)">{{ summaryHasBaseline ? deltaLabel(changes.p99_delta_rate) : '基线样本不足' }}</div>
        </div>
        <div class="stat rounded-box border border-base-300 bg-base-100">
          <div class="stat-title">慢请求率</div>
          <div class="stat-value text-2xl">{{ formatRate(summary.slow_rate) }}</div>
          <div class="stat-desc">阈值 ≥ {{ meta.slow_threshold_ms || 1000 }} ms · 错误率 {{ formatRate(summary.error_rate) }}</div>
        </div>
      </div>

      <div v-if="summary.sample_count > 0 && normalizedCoverage < 1" class="alert alert-warning mt-4 text-sm">
        <span>当前范围内有 {{ formatRate(1 - normalizedCoverage) }} 的历史请求缺少标准化路由，已合并为“历史未标准化”。新采集数据会自动恢复正常事件分组。</span>
      </div>

      <section class="card mt-5 border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold">耗时趋势 <span v-if="granularityLabel" class="badge badge-ghost badge-sm align-middle">{{ granularityLabel }}</span></h2>
              <p class="mt-1 text-xs text-base-content/60">上一周期 P95 已平移到当前时间轴，用于观察相同位置的性能变化。</p>
            </div>
            <span v-if="loading" class="loading loading-spinner loading-sm"></span>
          </div>
          <EmptyState v-if="!trend.length" class="mt-4" title="暂无耗时趋势" message="当前筛选范围内没有可用于分析的请求样本。" />
          <div v-else class="relative">
            <ApexChart ref="maintenanceChartRef" type="line" height="330" :options="trendOptions" :series="trendSeries" @mounted="applyMaintenanceAnnotations" />
            <SystemMaintenanceTooltip :tooltip="maintenanceTooltip" />
          </div>
        </div>
      </section>

      <section class="mt-5 overflow-hidden rounded-box border border-base-300 bg-base-100">
        <div class="flex items-start justify-between gap-3 border-b border-base-300 p-4">
          <div>
            <h2 class="font-semibold">事件性能榜</h2>
            <p class="mt-1 text-xs text-base-content/60">事件按“请求方法 + Actix 匹配路由”归并，默认展示 P95 最慢的前 {{ meta.event_limit || 50 }} 项。</p>
          </div>
        </div>
        <EmptyState v-if="!events.length" title="暂无事件数据" message="当前筛选范围内没有可显示的请求事件。" />
        <div v-else class="overflow-x-auto">
          <table class="table table-zebra">
            <thead>
              <tr>
                <th>事件</th>
                <th>样本</th>
                <th>平均</th>
                <th>P50</th>
                <th>P95</th>
                <th>P99</th>
                <th>最大</th>
                <th>较上一周期 P95</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="event in events" :key="`${event.method}:${event.route_pattern}`">
                <td class="max-w-96">
                  <div class="flex items-center gap-2">
                    <span class="badge badge-outline badge-sm font-mono">{{ event.method }}</span>
                    <span class="truncate font-mono text-xs" :title="event.route_pattern">{{ event.route_pattern }}</span>
                  </div>
                </td>
                <td>{{ Number(event.sample_count).toLocaleString('zh-CN') }}</td>
                <td class="font-mono text-xs">{{ formatDuration(event.avg_ms) }}</td>
                <td class="font-mono text-xs">{{ formatDuration(event.p50_ms) }}</td>
                <td class="font-mono text-xs font-semibold">{{ formatDuration(event.p95_ms) }}</td>
                <td class="font-mono text-xs">{{ formatDuration(event.p99_ms) }}</td>
                <td class="font-mono text-xs">{{ formatDuration(event.max_ms) }}</td>
                <td>
                  <span v-if="event.sample_count >= 20 && event.baseline_sample_count >= 20" class="font-mono text-xs" :class="deltaClass(event.p95_delta_rate)">
                    {{ deltaLabel(event.p95_delta_rate) }}
                  </span>
                  <span v-else class="text-xs text-base-content/40">样本不足</span>
                </td>
                <td>
                  <button class="btn btn-ghost btn-xs whitespace-nowrap" :disabled="!event.normalized" @click="viewRequestLogs(event)">查看日志</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </main>
</template>
