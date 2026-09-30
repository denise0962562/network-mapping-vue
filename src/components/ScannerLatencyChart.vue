<script setup>
import { useChartTheme } from '@/composables/useChartTheme'
import { formatTime as formatSystemClock } from '@/utils/systemTime'
import axios from 'axios'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import SystemMaintenanceTooltip from '@/components/SystemMaintenanceTooltip.vue'
import { formatChartTooltipTime, renderChartTooltip } from '@/utils/chartTooltip'
import http from '@/utils/http'
import { buildSystemMaintenanceAnnotations, loadSystemMaintenanceHistory, useSystemMaintenanceAnnotations } from '@/utils/systemMaintenanceAnnotations'

const ApexChart = defineAsyncComponent(() => import('vue3-apexcharts/core'))

const props = defineProps({
  scannerId: {
    type: String,
    required: true
  }
})

const rangeOptions = [
  { value: '30m', label: '最近 30 分钟', milliseconds: 30 * 60 * 1000 },
  { value: '1h', label: '最近 1 小时', milliseconds: 60 * 60 * 1000 },
  { value: '6h', label: '最近 6 小时', milliseconds: 6 * 60 * 60 * 1000 },
  { value: '24h', label: '最近 24 小时', milliseconds: 24 * 60 * 60 * 1000 },
  { value: '7d', label: '最近 7 天', milliseconds: 7 * 24 * 60 * 60 * 1000 },
  { value: '30d', label: '最近 30 天', milliseconds: 30 * 24 * 60 * 60 * 1000 }
]

const range = ref('30m')
const points = ref([])
const meta = ref(null)
const loading = ref(false)
const failed = ref(false)
const lastUpdatedAt = ref(null)
const { maintenanceAnnotations, maintenanceChartRef, maintenanceTooltip, showMaintenanceTooltip, hideMaintenanceTooltip, applyMaintenanceAnnotations } = useSystemMaintenanceAnnotations()
let requestController = null
let refreshTimer = null
let requestVersion = 0

function selectedDuration() {
  return rangeOptions.find((item) => item.value === range.value)?.milliseconds
    ?? rangeOptions[0].milliseconds
}

async function loadMaintenanceAnnotations(startAt, endAt, version) {
  const history = await loadSystemMaintenanceHistory()
  if (version !== requestVersion) return
  maintenanceAnnotations.value = buildSystemMaintenanceAnnotations(history, {
    startAt,
    endAt,
    onLabelMouseEnter: showMaintenanceTooltip,
    onLabelMouseLeave: hideMaintenanceTooltip
  })
}

async function loadHistory({ silent = false } = {}) {
  if (!props.scannerId) return
  const version = ++requestVersion
  requestController?.abort()
  requestController = new AbortController()
  if (!silent) loading.value = true
  const end = new Date()
  const start = new Date(end.getTime() - selectedDuration())
  try {
    const response = await http.get(`/api/scanner/${props.scannerId}/latency-history`, {
      params: {
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        granularity: 'auto'
      },
      signal: requestController.signal
    })
    const responsePoints = response.data?.data?.points
    if (response.data?.success !== true || !Array.isArray(responsePoints)) {
      throw new Error('服务器未返回有效延迟历史')
    }
    if (version !== requestVersion) return
    points.value = responsePoints
    meta.value = response.data.meta || null
    failed.value = false
    lastUpdatedAt.value = new Date()
    void loadMaintenanceAnnotations(start, end, version)
  } catch (error) {
    if (version !== requestVersion || axios.isCancel(error)) return
    console.error('load scanner latency history failed', error)
    failed.value = points.value.length === 0
  } finally {
    if (version === requestVersion) {
      loading.value = false
      requestController = null
    }
  }
}

const chartSeries = computed(() => [
  {
    name: '网络 RTT 平均值',
    data: points.value.map((point) => ({ x: point.timestamp_ms, y: point.network_avg_ms }))
  },
  {
    name: '网络 RTT P95',
    data: points.value.map((point) => ({ x: point.timestamp_ms, y: point.network_p95_ms }))
  },
  {
    name: '服务端处理',
    data: points.value.map((point) => ({ x: point.timestamp_ms, y: point.server_processing_avg_ms }))
  }
])

function formatLatency(value) {
  const milliseconds = Number(value)
  return Number.isFinite(milliseconds) ? `${milliseconds.toFixed(1)} ms` : '--'
}

const chartOptions = useChartTheme(() => ({
  chart: {
    type: 'line',
    height: 340,
    animations: { enabled: false },
    zoom: { enabled: true, type: 'x' },
    toolbar: { show: true, autoSelected: 'zoom' }
  },
  colors: ['#00a76f', '#f59e0b', '#008ffb'],
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 2 },
  markers: { size: 0, hover: { size: 4 } },
  legend: { position: 'top', horizontalAlign: 'left' },
  xaxis: { type: 'datetime', labels: { datetimeUTC: true, formatter: (value, timestamp) => formatSystemClock(timestamp ?? value) } },
  yaxis: {
    min: 0,
    labels: { formatter: (value) => `${Number(value).toFixed(0)} ms` }
  },
  tooltip: {
    shared: true,
    intersect: false,
    custom({ dataPointIndex }) {
      const point = points.value[dataPointIndex]
      if (!point) return ''
      return renderChartTooltip({
        title: formatChartTooltipTime(point.timestamp_ms),
        rows: [
          { label: '网络 RTT 平均值', value: formatLatency(point.network_avg_ms), color: '#00a76f' },
          { label: '网络 RTT P95', value: formatLatency(point.network_p95_ms), color: '#f59e0b' },
          { label: '服务端处理', value: formatLatency(point.server_processing_avg_ms), color: '#008ffb' }
        ],
        footer: `样本数 ${Number(point.sample_count).toLocaleString('zh-CN')}`
      })
    }
  },
  grid: { borderColor: 'rgba(128, 128, 128, 0.18)' }
}))

const totalSamples = computed(() =>
  points.value.reduce((total, point) => total + (Number(point.sample_count) || 0), 0)
)

const statusText = computed(() => {
  if (!lastUpdatedAt.value) return '尚未完成加载'
  return `粒度 ${meta.value?.granularity || 'auto'} · ${totalSamples.value.toLocaleString('zh-CN')} 个样本 · 更新于 ${formatSystemClock(lastUpdatedAt.value)}`
})

watch(() => props.scannerId, () => {
  points.value = []
  loadHistory()
})

watch(range, () => loadHistory())

onMounted(() => {
  loadHistory()
  refreshTimer = window.setInterval(() => loadHistory({ silent: true }), 60_000)
})

onBeforeUnmount(() => {
  requestVersion += 1
  requestController?.abort()
  if (refreshTimer) window.clearInterval(refreshTimer)
})
</script>

<template>
  <div class="card bg-base-100 card-border border-base-300 p-4">
    <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="font-semibold">服务端通信延迟趋势</h3>
        <p class="mt-1 text-xs opacity-60">网络 RTT 为 HTTPS 总 RTT 扣除服务端处理耗时后的估算值。</p>
      </div>
      <select v-model="range" class="select select-bordered select-sm" :disabled="loading">
        <option v-for="option in rangeOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <div v-if="loading && points.length === 0" class="grid min-h-72 place-items-center rounded-lg bg-base-200/60">
      <span class="loading loading-spinner loading-md"></span>
    </div>
    <EmptyState
      v-else-if="failed"
      type="error"
      title="延迟趋势加载失败"
      message="无法获取扫描器延迟历史，请稍后重试。"
    />
    <EmptyState
      v-else-if="points.length === 0"
      title="暂无延迟样本"
      message="升级扫描器并完成两个心跳周期后，这里将显示通信延迟趋势。"
    />
    <div v-else class="relative">
      <ApexChart ref="maintenanceChartRef" type="line" height="340" :options="chartOptions" :series="chartSeries" @mounted="applyMaintenanceAnnotations" />
      <SystemMaintenanceTooltip :tooltip="maintenanceTooltip" />
    </div>
    <div class="mt-2 text-xs opacity-60">{{ statusText }}</div>
  </div>
</template>
