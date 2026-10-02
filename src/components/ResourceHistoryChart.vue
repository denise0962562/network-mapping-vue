<script setup>
import { useChartTheme } from '@/composables/useChartTheme'
import ChartCsvExport from '@/components/ChartCsvExport.vue'
import { formatTime as formatSystemClock, toLocalInputValue as systemInputValue, parseSystemDate } from '@/utils/systemTime'
import axios from 'axios'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import SystemMaintenanceTooltip from '@/components/SystemMaintenanceTooltip.vue'
import { formatChartTooltipTime, renderChartTooltip } from '@/utils/chartTooltip'
import http from '@/utils/http'
import { buildSystemMaintenanceAnnotations, loadSystemMaintenanceHistory, useSystemMaintenanceAnnotations } from '@/utils/systemMaintenanceAnnotations'

const ApexChart = defineAsyncComponent(() => import('vue3-apexcharts/core'))

const emit = defineEmits(['error'])

const DEFAULT_RANGE_MILLISECONDS = 30 * 60 * 1000

const rangeOptions = [
  { value: '30m', label: '最近 30 分钟', milliseconds: DEFAULT_RANGE_MILLISECONDS },
  { value: '1h', label: '最近 1 小时', milliseconds: 60 * 60 * 1000 },
  { value: '6h', label: '最近 6 小时', milliseconds: 6 * 60 * 60 * 1000 },
  { value: '24h', label: '最近 24 小时', milliseconds: 24 * 60 * 60 * 1000 },
  { value: '7d', label: '最近 7 天', milliseconds: 7 * 24 * 60 * 60 * 1000 },
  { value: '30d', label: '最近 30 天', milliseconds: 30 * 24 * 60 * 60 * 1000 },
  { value: 'custom', label: '自定义时间', milliseconds: null }
]
const granularityOptions = [
  { value: 'auto', label: '自动', seconds: null },
  { value: '10s', label: '10 秒', seconds: 10 },
  { value: '30s', label: '30 秒', seconds: 30 },
  { value: '1m', label: '1 分钟', seconds: 60 },
  { value: '5m', label: '5 分钟', seconds: 300 },
  { value: '15m', label: '15 分钟', seconds: 900 },
  { value: '30m', label: '30 分钟', seconds: 1800 },
  { value: '1h', label: '1 小时', seconds: 3600 },
  { value: '2h', label: '2 小时', seconds: 7200 }
]

function toLocalInputValue(date) {
  return systemInputValue(date)
}

function defaultCustomRange() {
  const end = new Date()
  return {
    start: toLocalInputValue(new Date(end.getTime() - DEFAULT_RANGE_MILLISECONDS)),
    end: toLocalInputValue(end)
  }
}

const initialCustomRange = defaultCustomRange()
const range = ref('30m')
const granularity = ref('auto')
const customStart = ref(initialCustomRange.start)
const customEnd = ref(initialCustomRange.end)
const points = ref([])
const meta = ref(null)
const loading = ref(false)
const failed = ref(false)
const hasLoaded = ref(false)
const lastUpdatedAt = ref(null)
const { maintenanceAnnotations, maintenanceChartRef, maintenanceTooltip, showMaintenanceTooltip, hideMaintenanceTooltip, applyMaintenanceAnnotations } = useSystemMaintenanceAnnotations()

let requestController = null
let refreshTimer = null
let requestVersion = 0

function selectedRangeMilliseconds() {
  if (range.value !== 'custom') {
    return rangeOptions.find((item) => item.value === range.value)?.milliseconds ?? null
  }
  const start = parseSystemDate(customStart.value)
  const end = parseSystemDate(customEnd.value)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return end.getTime() - start.getTime()
}

function granularityDisabled(option) {
  if (option.value === 'auto') return false
  const duration = selectedRangeMilliseconds()
  if (!duration || duration <= 0) return false
  return Math.ceil(duration / (option.seconds * 1000)) > 1500
}

function ensureValidGranularity() {
  const selected = granularityOptions.find((item) => item.value === granularity.value)
  if (selected && granularityDisabled(selected)) granularity.value = 'auto'
}

function handleRangeChange() {
  if (range.value === 'custom') {
    const nextRange = defaultCustomRange()
    customStart.value = nextRange.start
    customEnd.value = nextRange.end
  }
  ensureValidGranularity()
}

function buildRequestParams() {
  let start
  let end
  if (range.value === 'custom') {
    start = parseSystemDate(customStart.value)
    end = parseSystemDate(customEnd.value)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('请选择有效的开始和结束时间。')
    }
  } else {
    end = new Date()
    const duration = selectedRangeMilliseconds()
    start = new Date(end.getTime() - duration)
  }
  if (start >= end) throw new Error('开始时间必须早于结束时间。')
  if (end.getTime() - start.getTime() > 30 * 24 * 60 * 60 * 1000) {
    throw new Error('查询时间范围不能超过 30 天。')
  }
  return {
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    granularity: granularity.value
  }
}

async function loadMaintenanceAnnotations(params, version) {
  const history = await loadSystemMaintenanceHistory()
  if (version !== requestVersion) return
  maintenanceAnnotations.value = buildSystemMaintenanceAnnotations(history, {
    startAt: params.start_at,
    endAt: params.end_at,
    onLabelMouseEnter: showMaintenanceTooltip,
    onLabelMouseLeave: hideMaintenanceTooltip
  })
}

async function loadHistory({ silent = false } = {}) {
  let params
  try {
    params = buildRequestParams()
  } catch (error) {
    emit('error', { title: '资源趋势查询失败', description: error.message })
    return
  }

  const version = ++requestVersion
  requestController?.abort()
  requestController = new AbortController()
  loading.value = true
  try {
    const response = await http.get('/api/data/system-resource-history', {
      params,
      signal: requestController.signal
    })
    const responsePoints = response.data?.data?.points
    if (response.data?.success !== true || !Array.isArray(responsePoints)) {
      throw new Error('服务器未返回有效的资源趋势数据。')
    }
    if (version !== requestVersion) return
    points.value = responsePoints
    meta.value = response.data.meta || null
    failed.value = false
    hasLoaded.value = true
    lastUpdatedAt.value = new Date()
    void loadMaintenanceAnnotations(params, version)
  } catch (error) {
    if (version !== requestVersion || axios.isCancel(error)) return
    console.error('load resource history failed', error)
    failed.value = !hasLoaded.value
    if (!silent) {
      emit('error', {
        title: '资源趋势加载失败',
        description: error.response?.data?.message || '请检查网络连接或服务器运行状态。'
      })
    }
  } finally {
    if (version === requestVersion) {
      loading.value = false
      requestController = null
    }
  }
}

const hasMetrics = computed(() =>
  points.value.some((point) => [point.cpu_avg, point.ram_avg, point.swap_avg, point.disk_avg].some(Number.isFinite))
)

const hasSwapMetrics = computed(() =>
  points.value.some((point) => [point.swap_avg, point.swap_max].some(Number.isFinite))
)

const latestPoint = computed(() =>
  [...points.value]
    .reverse()
    .find((point) => [point.cpu_avg, point.ram_avg, point.swap_avg, point.disk_avg].some(Number.isFinite)) || null
)

function peakValue(field) {
  const values = points.value.map((point) => point[field]).filter(Number.isFinite)
  return values.length ? Math.max(...values) : null
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${Number(value).toFixed(1)}%` : '--'
}

const resourceStats = computed(() => {
  const stats = [
    {
      name: 'CPU',
      current: formatPercent(latestPoint.value?.cpu_avg),
      peak: formatPercent(peakValue('cpu_max')),
      class: 'text-info'
    },
    {
      name: '内存',
      current: formatPercent(latestPoint.value?.ram_avg),
      peak: formatPercent(peakValue('ram_max')),
      class: 'text-success'
    }
  ]
  if (hasSwapMetrics.value) {
    stats.push({
      name: 'Swap',
      current: formatPercent(latestPoint.value?.swap_avg),
      peak: formatPercent(peakValue('swap_max')),
      class: 'text-secondary'
    })
  }
  stats.push({
    name: '磁盘',
    current: formatPercent(latestPoint.value?.disk_avg),
    peak: formatPercent(peakValue('disk_max')),
    class: 'text-warning'
  })
  return stats
})

const chartSeries = computed(() => {
  const series = [
    {
      name: 'CPU',
      data: points.value.map((point) => ({ x: point.timestamp_ms, y: point.cpu_avg }))
    },
    {
      name: '内存',
      data: points.value.map((point) => ({ x: point.timestamp_ms, y: point.ram_avg }))
    }
  ]
  if (hasSwapMetrics.value) {
    series.push({
      name: 'Swap',
      data: points.value.map((point) => ({ x: point.timestamp_ms, y: point.swap_avg }))
    })
  }
  series.push({
    name: '磁盘',
    data: points.value.map((point) => ({ x: point.timestamp_ms, y: point.disk_avg }))
  })
  return series
})

const chartOptions = useChartTheme(() => ({
  chart: {
    type: 'line',
    height: 420,
    animations: { enabled: false },
    zoom: { enabled: true, type: 'x', autoScaleYaxis: false },
    toolbar: { show: true, autoSelected: 'zoom' }
  },
  colors: hasSwapMetrics.value
    ? ['#008ffb', '#00a76f', '#775dd0', '#f59e0b']
    : ['#008ffb', '#00a76f', '#f59e0b'],
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 2 },
  markers: { size: 0, hover: { size: 4 } },
  legend: { position: 'top', horizontalAlign: 'left' },
  xaxis: {
    type: 'datetime',
    labels: { datetimeUTC: true, formatter: (value, timestamp) => formatSystemClock(timestamp ?? value) }
  },
  yaxis: {
    min: 0,
    max: 100,
    tickAmount: 5,
    labels: { formatter: (value) => `${Number(value).toFixed(0)}%` }
  },
  grid: { borderColor: 'rgba(128, 128, 128, 0.18)' },
  tooltip: {
    shared: true,
    intersect: false,
    custom({ dataPointIndex }) {
      const point = points.value[dataPointIndex]
      if (!point) return ''
      const rows = [
        { label: 'CPU', value: `平均 ${formatPercent(point.cpu_avg)} · 峰值 ${formatPercent(point.cpu_max)}`, color: '#008ffb' },
        { label: '内存', value: `平均 ${formatPercent(point.ram_avg)} · 峰值 ${formatPercent(point.ram_max)}`, color: '#00a76f' }
      ]
      if (hasSwapMetrics.value) {
        rows.push({ label: 'Swap', value: `平均 ${formatPercent(point.swap_avg)} · 峰值 ${formatPercent(point.swap_max)}`, color: '#775dd0' })
      }
      rows.push({ label: '磁盘', value: `平均 ${formatPercent(point.disk_avg)} · 峰值 ${formatPercent(point.disk_max)}`, color: '#f59e0b' })
      return renderChartTooltip({
        title: formatChartTooltipTime(point.timestamp_ms),
        rows,
        footer: `样本数 ${Number(point.sample_count).toLocaleString('zh-CN')}`
      })
    }
  },
  responsive: [
    {
      breakpoint: 640,
      options: {
        chart: { height: 360 }
      }
    }
  ]
}))

const totalSamples = computed(() =>
  points.value.reduce((total, point) => total + (Number(point.sample_count) || 0), 0)
)

const statusLabel = computed(() => {
  if (!lastUpdatedAt.value) return '尚未完成加载'
  const granularityLabel = meta.value?.granularity || granularity.value
  return `粒度 ${granularityLabel} · ${points.value.length} 个时间点 · ${totalSamples.value.toLocaleString('zh-CN')} 个样本 · 更新于 ${formatSystemClock(lastUpdatedAt.value)}`
})

onMounted(() => {
  loadHistory()
  refreshTimer = window.setInterval(() => {
    if (range.value !== 'custom') loadHistory({ silent: true })
  }, 60_000)
})

onBeforeUnmount(() => {
  requestVersion += 1
  requestController?.abort()
  if (refreshTimer) window.clearInterval(refreshTimer)
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">服务器资源趋势</h2>
        <p class="mt-1 text-xs text-base-content/60">展示各时间桶内 CPU、内存、磁盘及（配置时）Swap 使用率的平均值，Tooltip 同时显示峰值。</p>
      </div>

      <div class="flex flex-wrap items-end justify-end gap-2">
        <label class="form-control w-36">
          <span class="label-text mb-1 text-xs">时间范围</span>
          <select v-model="range" class="select select-bordered select-sm w-full" :disabled="loading" @change="handleRangeChange">
            <option v-for="option in rangeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>

        <label class="form-control w-32">
          <span class="label-text mb-1 text-xs">时间粒度</span>
          <select v-model="granularity" class="select select-bordered select-sm w-full" :disabled="loading">
            <option
              v-for="option in granularityOptions"
              :key="option.value"
              :value="option.value"
              :disabled="granularityDisabled(option)"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <ChartCsvExport
          filename="resource-history"
          :series="chartSeries"
          :options="chartOptions"
          unit="%"
          :disabled="loading || !hasMetrics"
        />
        <button class="btn btn-neutral btn-sm" :disabled="loading" @click="loadHistory()">
          <span v-if="loading" class="loading loading-spinner loading-xs"></span>
          {{ loading ? '加载中…' : '应用' }}
        </button>
      </div>
    </div>

    <div v-if="range === 'custom'" class="grid gap-3 rounded-box bg-base-200/60 p-3 sm:grid-cols-2">
      <label class="form-control w-full">
        <span class="label-text mb-1 text-xs">开始时间</span>
        <SystemDateTimeInput v-model="customStart" class="input input-bordered input-sm w-full" :disabled="loading" @change="ensureValidGranularity" />
      </label>
      <label class="form-control w-full">
        <span class="label-text mb-1 text-xs">结束时间</span>
        <SystemDateTimeInput v-model="customEnd" class="input input-bordered input-sm w-full" :disabled="loading" @change="ensureValidGranularity" />
      </label>
    </div>

    <div
      v-if="hasMetrics"
      class="flex flex-col gap-3"
      :class="resourceStats.length === 4 ? 'min-[52rem]:flex-row' : 'min-[39rem]:flex-row'"
    >
      <div v-for="item in resourceStats" :key="item.name" class="flex-1 rounded-box border border-base-300 bg-base-200/40 px-4 py-3">
        <div class="text-xs text-base-content/60">{{ item.name }} 最新平均值</div>
        <div class="mt-1 flex items-baseline justify-between gap-3">
          <span class="text-xl font-semibold" :class="item.class">{{ item.current }}</span>
          <span class="text-xs text-base-content/50">区间峰值 {{ item.peak }}</span>
        </div>
      </div>
    </div>

    <div v-if="loading && !hasLoaded" class="skeleton h-96 w-full rounded-box"></div>
    <EmptyState
      v-else-if="failed && !hasLoaded"
      type="error"
      title="资源趋势加载失败"
      message="无法从服务器读取历史资源数据，请稍后重试。"
    />
    <EmptyState
      v-else-if="!hasMetrics"
      title="暂无资源数据"
      message="当前时间范围内没有可用于绘图的系统资源记录。"
    />
    <div v-else class="relative">
      <ApexChart ref="maintenanceChartRef" type="line" height="420" :options="chartOptions" :series="chartSeries" @mounted="applyMaintenanceAnnotations" />
      <SystemMaintenanceTooltip :tooltip="maintenanceTooltip" />
      <span v-if="loading" class="loading loading-spinner loading-sm absolute top-2 right-2"></span>
    </div>

    <div class="text-right text-xs text-base-content/50">{{ statusLabel }}</div>
  </div>
</template>
