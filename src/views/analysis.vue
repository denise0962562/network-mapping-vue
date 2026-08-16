<script setup>
import axios from 'axios'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import http from '@/utils/http'

const ApexChart = defineAsyncComponent(() => import('vue3-apexcharts'))

const weekOptions = [4, 8, 12]
const topOptions = [5, 7, 10]
const weekdayRows = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const filters = ref({
  weeks: 12,
  scannerId: '',
  taskSource: '',
  dimension: 'service',
  topN: 5
})
const activeFilters = ref({ ...filters.value })
const scannerList = ref([])
const scannerLoading = ref(false)
const alerts = ref([])
const distributionData = ref({ items: [], other_count: 0, total: 0 })
const heatmapItems = ref([])
const distributionLoading = ref(false)
const heatmapLoading = ref(false)
const distributionFailed = ref(false)
const heatmapFailed = ref(false)
const hasLoadedDistribution = ref(false)
const hasLoadedHeatmap = ref(false)
const lastUpdatedAt = ref(null)

let analysisController = null
let scannerController = null
let requestVersion = 0

const isLoading = computed(() => distributionLoading.value || heatmapLoading.value)

function pushAlert(type, title, description = '', timeout = 7000) {
  alerts.value.unshift({
    id: crypto.randomUUID(),
    type,
    title,
    description,
    timeout
  })
}

function closeAlert(id) {
  alerts.value = alerts.value.filter((alert) => alert.id !== id)
}

function startOfWeekMonday(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = result.getDay()
  result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day))
  result.setHours(0, 0, 0, 0)
  return result
}

function formatDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildDateRange(weeks) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = startOfWeekMonday(today)
  start.setDate(start.getDate() - (weeks - 1) * 7)
  const end = new Date(today)
  end.setDate(end.getDate() + 1)
  return { startAt: start.toISOString(), endAt: end.toISOString() }
}

function buildCommonParams(snapshot) {
  const range = buildDateRange(snapshot.weeks)
  const params = {
    start_at: range.startAt,
    end_at: range.endAt
  }
  if (snapshot.scannerId) params.scanner_id = snapshot.scannerId
  if (snapshot.taskSource) params.task_source = snapshot.taskSource
  return params
}

function parseDistribution(response) {
  const data = response.data?.data
  if (response.data?.success !== true || !data || !Array.isArray(data.items)) {
    throw new Error('服务器未返回有效的分布数据')
  }
  return {
    items: data.items,
    other_count: Number(data.other_count) || 0,
    total: Number(data.total) || 0
  }
}

function parseHeatmap(response) {
  const items = response.data?.data?.items
  if (response.data?.success !== true || !Array.isArray(items)) {
    throw new Error('服务器未返回有效的热力图数据')
  }
  return items
}

async function loadScanners() {
  scannerController?.abort()
  scannerController = new AbortController()
  scannerLoading.value = true
  try {
    const response = await http.get('/api/scanner/list', { signal: scannerController.signal })
    const items = response.data?.data
    if (response.data?.success !== true || !Array.isArray(items)) {
      throw new Error('服务器未返回有效的扫描器列表')
    }
    scannerList.value = items
      .map((item) => ({ id: item.scanner_id, name: item.name || item.scanner_id }))
      .filter((item) => item.id)
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  } catch (error) {
    if (!axios.isCancel(error)) {
      console.error('load analysis scanners failed', error)
      pushAlert('warning', '扫描器筛选加载失败', '仍可查看全部扫描器的数据。')
    }
  } finally {
    scannerLoading.value = false
  }
}

async function loadAnalysis() {
  const version = ++requestVersion
  analysisController?.abort()
  analysisController = new AbortController()
  const snapshot = { ...filters.value }
  activeFilters.value = snapshot
  const commonParams = buildCommonParams(snapshot)

  distributionLoading.value = true
  heatmapLoading.value = true
  const results = await Promise.allSettled([
    http.get('/api/analysis/distribution', {
      params: {
        ...commonParams,
        dimension: snapshot.dimension,
        limit: snapshot.topN
      },
      signal: analysisController.signal
    }),
    http.get('/api/analysis/discovery-heatmap', {
      params: commonParams,
      signal: analysisController.signal
    })
  ])

  if (version !== requestVersion) return

  const failedSections = []
  const [distributionResult, heatmapResult] = results
  if (distributionResult.status === 'fulfilled') {
    try {
      distributionData.value = parseDistribution(distributionResult.value)
      distributionFailed.value = false
      hasLoadedDistribution.value = true
    } catch (error) {
      console.error('parse distribution failed', error)
      distributionFailed.value = true
      failedSections.push('服务分布')
    }
  } else if (!axios.isCancel(distributionResult.reason)) {
    console.error('load distribution failed', distributionResult.reason)
    distributionFailed.value = true
    failedSections.push('服务分布')
  }

  if (heatmapResult.status === 'fulfilled') {
    try {
      heatmapItems.value = parseHeatmap(heatmapResult.value)
      heatmapFailed.value = false
      hasLoadedHeatmap.value = true
    } catch (error) {
      console.error('parse heatmap failed', error)
      heatmapFailed.value = true
      failedSections.push('发现 IP 热力图')
    }
  } else if (!axios.isCancel(heatmapResult.reason)) {
    console.error('load heatmap failed', heatmapResult.reason)
    heatmapFailed.value = true
    failedSections.push('发现 IP 热力图')
  }

  if (failedSections.length > 0) {
    pushAlert('error', '分析数据加载失败', `${failedSections.join('、')}暂时不可用，已保留上一次成功数据。`)
  } else {
    lastUpdatedAt.value = new Date()
  }

  distributionLoading.value = false
  heatmapLoading.value = false
  analysisController = null
}

const distributionSegments = computed(() => {
  const items = distributionData.value.items.map((item) => ({
    name: String(item.name),
    value: Number(item.count) || 0
  }))
  if (distributionData.value.other_count > 0) {
    items.push({ name: '其他', value: distributionData.value.other_count })
  }
  return items
})

const pieSeries = computed(() => distributionSegments.value.map((item) => item.value))
const pieLabels = computed(() => distributionSegments.value.map((item) => item.name))
const pieOptions = computed(() => ({
  chart: { type: 'pie', toolbar: { show: false } },
  labels: pieLabels.value,
  legend: { position: 'bottom' },
  dataLabels: {
    enabled: true,
    formatter: (value) => `${Number(value).toFixed(1)}%`
  },
  stroke: { width: 1 },
  tooltip: {
    y: { formatter: (value) => `${Number(value).toLocaleString('zh-CN')} 个端点` }
  },
  responsive: [
    {
      breakpoint: 480,
      options: { chart: { height: 300 }, legend: { position: 'bottom' } }
    }
  ]
}))

const weekStarts = computed(() => {
  const currentWeekStart = startOfWeekMonday(new Date())
  return Array.from({ length: activeFilters.value.weeks }, (_, index) => {
    const date = new Date(currentWeekStart)
    date.setDate(date.getDate() - (activeFilters.value.weeks - 1 - index) * 7)
    return date
  })
})

const weekLabels = computed(() =>
  weekStarts.value.map((date) => `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`)
)

const heatmapCountMap = computed(() =>
  new Map(heatmapItems.value.map((item) => [String(item.date), Number(item.count) || 0]))
)

const heatmapSeries = computed(() => {
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  return weekdayRows.map((rowName, rowIndex) => ({
    name: rowName,
    data: weekStarts.value.map((weekStart, weekIndex) => {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + rowIndex)
      const dateLabel = formatDateKey(date)
      return {
        x: weekLabels.value[weekIndex],
        y: date > today ? null : (heatmapCountMap.value.get(dateLabel) ?? 0),
        dateLabel
      }
    })
  }))
})

function quantile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0
  const position = (sortedValues.length - 1) * ratio
  const base = Math.floor(position)
  const remainder = position - base
  return sortedValues[base + 1] === undefined
    ? sortedValues[base]
    : sortedValues[base] + remainder * (sortedValues[base + 1] - sortedValues[base])
}

const heatmapColorRanges = computed(() => {
  const positiveValues = heatmapSeries.value
    .flatMap((series) => series.data.map((point) => point.y))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right)
  const ranges = [{ from: 0, to: 0, name: '无发现', color: '#d1d5db' }]
  if (positiveValues.length === 0) return ranges

  const maximum = positiveValues[positiveValues.length - 1]
  const lowEnd = Math.max(1, Math.ceil(quantile(positiveValues, 0.4)))
  const mediumEnd = Math.max(lowEnd, Math.ceil(quantile(positiveValues, 0.8)))
  ranges.push({ from: 1, to: Math.min(lowEnd, maximum), name: '较低', color: '#008ffb' })
  if (lowEnd < maximum) {
    ranges.push({ from: lowEnd + 1, to: Math.min(mediumEnd, maximum), name: '中等', color: '#00e396' })
  }
  if (mediumEnd < maximum) {
    ranges.push({ from: mediumEnd + 1, to: maximum, name: '较高', color: '#ff4560' })
  }
  return ranges.filter((range) => range.from <= range.to)
})

const heatmapOptions = computed(() => ({
  chart: { type: 'heatmap', toolbar: { show: false } },
  dataLabels: { enabled: false },
  xaxis: { type: 'category', title: { text: `最近 ${activeFilters.value.weeks} 周（按周起始日）` } },
  yaxis: { title: { text: '周几' } },
  plotOptions: {
    heatmap: {
      shadeIntensity: 0.25,
      radius: 2,
      useFillColorAsStroke: true,
      colorScale: { ranges: heatmapColorRanges.value }
    }
  },
  stroke: { width: 1 },
  tooltip: {
    custom({ series, seriesIndex, dataPointIndex, w }) {
      const point = w.config.series[seriesIndex].data[dataPointIndex]
      const value = series[seriesIndex][dataPointIndex]
      if (value === null || value === undefined) return ''
      return `<div class="p-2 text-xs"><div><strong>${w.config.series[seriesIndex].name}</strong></div><div>日期: ${point.dateLabel}</div><div>发现 IP: ${Number(value).toLocaleString('zh-CN')}</div></div>`
    }
  }
}))

const discoveredTotal = computed(() =>
  heatmapItems.value.reduce((total, item) => total + (Number(item.count) || 0), 0)
)

const lastUpdatedLabel = computed(() => {
  if (!lastUpdatedAt.value) return '尚未完成加载'
  return `更新于 ${lastUpdatedAt.value.toLocaleTimeString('zh-CN', { hour12: false })}`
})

onMounted(() => {
  loadScanners()
  loadAnalysis()
})

onBeforeUnmount(() => {
  requestVersion += 1
  analysisController?.abort()
  scannerController?.abort()
})
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
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">数据分析</h1>
        <p class="mt-1 text-sm text-base-content/60">按扫描结果查看常见服务、开放端口和每日发现的 IP。</p>
      </div>
      <span class="text-xs text-base-content/50">{{ lastUpdatedLabel }}</span>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body gap-4 p-4">
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">时间范围</span>
            <select v-model.number="filters.weeks" class="select select-bordered w-full">
              <option v-for="weeks in weekOptions" :key="weeks" :value="weeks">最近 {{ weeks }} 周</option>
            </select>
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">扫描器</span>
            <select v-model="filters.scannerId" class="select select-bordered w-full" :disabled="scannerLoading">
              <option value="">{{ scannerLoading ? '加载扫描器中…' : '全部扫描器' }}</option>
              <option v-for="scanner in scannerList" :key="scanner.id" :value="scanner.id">{{ scanner.name }}</option>
            </select>
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">任务来源</span>
            <select v-model="filters.taskSource" class="select select-bordered w-full">
              <option value="">全部来源</option>
              <option value="manual">手动任务</option>
              <option value="automatic">自动任务</option>
            </select>
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">分布维度</span>
            <select v-model="filters.dimension" class="select select-bordered w-full">
              <option value="service">识别服务</option>
              <option value="port">开放端口</option>
            </select>
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">显示数量</span>
            <select v-model.number="filters.topN" class="select select-bordered w-full">
              <option v-for="item in topOptions" :key="item" :value="item">Top {{ item }}</option>
            </select>
          </label>
        </div>

        <div class="flex justify-end">
          <button class="btn btn-neutral btn-sm" :disabled="isLoading" @click="loadAnalysis">
            <span v-if="isLoading" class="loading loading-spinner loading-xs"></span>
            {{ isLoading ? '查询中…' : '应用筛选' }}
          </button>
        </div>
      </div>
    </div>

    <div class="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
      <section class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold">常见{{ activeFilters.dimension === 'service' ? '服务' : '端口' }}分布</h2>
              <p class="mt-1 text-xs text-base-content/60">按唯一 IP、端口和任务执行去重，Top N 之外合并为“其他”。</p>
            </div>
            <span class="badge badge-ghost whitespace-nowrap">共 {{ distributionData.total.toLocaleString('zh-CN') }} 个端点</span>
          </div>

          <div v-if="distributionLoading && !hasLoadedDistribution" class="mt-4 skeleton h-80 w-full rounded-box"></div>
          <EmptyState
            v-else-if="distributionFailed && !hasLoadedDistribution"
            class="mt-4"
            type="error"
            title="服务分布加载失败"
            message="无法从服务器获取统计数据，请稍后重试。"
          />
          <EmptyState
            v-else-if="distributionData.total === 0"
            class="mt-4"
            title="暂无服务数据"
            message="当前筛选范围内没有可用于统计的扫描结果。"
          />
          <div v-else class="relative mt-2">
            <ApexChart type="pie" height="340" :options="pieOptions" :series="pieSeries" />
            <span v-if="distributionLoading" class="loading loading-spinner loading-sm absolute top-2 right-2"></span>
          </div>
        </div>
      </section>

      <section class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold">发现 IP 热力图</h2>
              <p class="mt-1 text-xs text-base-content/60">按自然日统计去重 IP；无发现显示为 0，未来日期留空。</p>
            </div>
            <span class="badge badge-ghost whitespace-nowrap">累计 {{ discoveredTotal.toLocaleString('zh-CN') }}</span>
          </div>

          <div v-if="heatmapLoading && !hasLoadedHeatmap" class="mt-4 skeleton h-96 w-full rounded-box"></div>
          <EmptyState
            v-else-if="heatmapFailed && !hasLoadedHeatmap"
            class="mt-4"
            type="error"
            title="热力图加载失败"
            message="无法从服务器获取统计数据，请稍后重试。"
          />
          <div v-else class="relative mt-2">
            <ApexChart type="heatmap" height="400" :options="heatmapOptions" :series="heatmapSeries" />
            <span v-if="heatmapLoading" class="loading loading-spinner loading-sm absolute top-2 right-2"></span>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>
