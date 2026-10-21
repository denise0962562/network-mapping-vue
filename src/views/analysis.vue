<script setup>
import { useChartTheme } from '@/composables/useChartTheme'
import ChartCsvExport from '@/components/ChartCsvExport.vue'
import { useTheme } from '@/composables/useTheme'
import { formatDateTime as formatSystemDateTime, formatTime as formatSystemClock } from '@/utils/systemTime'
import { calendarDate, mondayDate, addCalendarDays, calendarMidnight, timeSettings } from '@/utils/systemTime'
import axios from 'axios'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch, useId } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import { renderChartTooltip } from '@/utils/chartTooltip'
import http from '@/utils/http'

const formFieldId = useId()
const { isDark } = useTheme()
const ApexChart = defineAsyncComponent(() => import('vue3-apexcharts/core'))

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
const distributionError = ref('')
const heatmapError = ref('')
const hasLoadedDistribution = ref(false)
const hasLoadedHeatmap = ref(false)
const lastUpdatedAt = ref(null)
const snapshotDataAsOf = ref(null)
const heatmapChartContainer = ref(null)
const heatmapChartHeight = ref(380)
const hoveredHeatmapValue = ref(null)

let analysisController = null
let scannerController = null
let requestVersion = 0
let heatmapResizeObserver = null
let heatmapResizeFrame = null

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
  return new Date(`${mondayDate(date)}T00:00:00Z`)
}

function formatDateKey(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildDateRange(weeks) {
  const start = addCalendarDays(mondayDate(), -(weeks - 1) * 7)
  const end = addCalendarDays(calendarDate(), 1)
  return { startAt: calendarMidnight(start), endAt: calendarMidnight(end) }
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

function analysisErrorMessage(error) {
  const body = error?.response?.data
  const message = typeof body?.message === 'string' ? body.message : '无法从服务器获取统计数据，请稍后重试。'
  const progress = body?.progress
  if (progress?.last_error) {
    return `${message}\n失败执行：${progress.failed_execution_id ?? '未知'}；最近原因：${progress.last_error}`
  }
  return message
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
      const dataAsOf = distributionResult.value.data?.meta?.data_as_of
      snapshotDataAsOf.value = dataAsOf ? new Date(dataAsOf) : null
      distributionFailed.value = false
      distributionError.value = ''
      hasLoadedDistribution.value = true
    } catch (error) {
      console.error('parse distribution failed', error)
      distributionFailed.value = true
      distributionError.value = analysisErrorMessage(error)
      failedSections.push('服务分布')
    }
  } else if (!axios.isCancel(distributionResult.reason)) {
    console.error('load distribution failed', distributionResult.reason)
    distributionFailed.value = true
    distributionError.value = analysisErrorMessage(distributionResult.reason)
    failedSections.push('服务分布')
  }

  if (heatmapResult.status === 'fulfilled') {
    try {
      heatmapItems.value = parseHeatmap(heatmapResult.value)
      heatmapFailed.value = false
      heatmapError.value = ''
      hasLoadedHeatmap.value = true
    } catch (error) {
      console.error('parse heatmap failed', error)
      heatmapFailed.value = true
      heatmapError.value = analysisErrorMessage(error)
      failedSections.push('发现 IP 热力图')
    }
  } else if (!axios.isCancel(heatmapResult.reason)) {
    console.error('load heatmap failed', heatmapResult.reason)
    heatmapFailed.value = true
    heatmapError.value = analysisErrorMessage(heatmapResult.reason)
    failedSections.push('发现 IP 热力图')
  }

  if (failedSections.length > 0) {
    const reasons = [...new Set([distributionError.value, heatmapError.value].filter(Boolean))]
    pushAlert('error', '分析数据加载失败', reasons.join('\n'))
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
const pieOptions = useChartTheme(() => ({
  chart: { type: 'pie', toolbar: { show: false } },
  labels: pieLabels.value,
  legend: { position: 'bottom' },
  dataLabels: {
    enabled: true,
    formatter: (value) => `${Number(value).toFixed(1)}%`
  },
  stroke: { width: 1, colors: [isDark.value ? '#1d232a' : '#ffffff'] },
  tooltip: {
    custom({ seriesIndex, dataPointIndex, w }) {
      const index = Number.isInteger(dataPointIndex) ? dataPointIndex : seriesIndex
      return renderChartTooltip({
        title: w.globals.labels[index],
        rows: [{
          label: '端点数',
          value: `${Number(pieSeries.value[index]).toLocaleString('zh-CN')} 个`,
          color: w.globals.colors[index]
        }],
        footer: `占比 ${distributionData.value.total > 0 ? ((pieSeries.value[index] / distributionData.value.total) * 100).toFixed(1) : '0.0'}%`
      })
    }
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
    date.setUTCDate(date.getUTCDate() - (activeFilters.value.weeks - 1 - index) * 7)
    return date
  })
})

const weekLabels = computed(() =>
  weekStarts.value.map((date) => `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`)
)

const heatmapCountMap = computed(() =>
  new Map(heatmapItems.value.map((item) => [String(item.date), Number(item.count) || 0]))
)

const heatmapSeries = computed(() => {
  const today = calendarDate()
  return weekdayRows.map((rowName, rowIndex) => ({
    name: rowName,
    data: weekStarts.value.map((weekStart, weekIndex) => {
      const date = new Date(weekStart)
      date.setUTCDate(date.getUTCDate() + rowIndex)
      const dateLabel = formatDateKey(date)
      return {
        x: weekLabels.value[weekIndex],
        y: dateLabel > today ? null : (heatmapCountMap.value.get(dateLabel) ?? 0),
        dateLabel
      }
    })
  }))
})

const heatmapMaximum = computed(() => Math.max(
  1,
  ...heatmapSeries.value
    .flatMap((series) => series.data.map((point) => point.y))
    .filter((value) => Number.isFinite(value))
))

const heatmapOptions = useChartTheme(() => ({
  chart: {
    type: 'heatmap',
    toolbar: { show: false },
    events: {
      dataPointMouseEnter(_, __, config) {
        const value = config.w.config.series[config.seriesIndex]?.data[config.dataPointIndex]?.y
        hoveredHeatmapValue.value = Number.isFinite(value) ? value : null
      },
      dataPointMouseLeave() {
        hoveredHeatmapValue.value = null
      }
    }
  },
  colors: ['#008ffb'],
  dataLabels: { enabled: false },
  xaxis: { type: 'category', title: { text: `最近 ${activeFilters.value.weeks} 周（按周起始日）` } },
  yaxis: { title: { text: '星期' } },
  plotOptions: {
    heatmap: {
      shadeIntensity: 0.5,
      radius: 0,
      useFillColorAsStroke: false,
      colorScale: {
        min: 0,
        max: heatmapMaximum.value
      }
    }
  },
  stroke: { width: 1, colors: [isDark.value ? '#1d232a' : '#ffffff'] },
  legend: { show: false },
  tooltip: {
    custom({ series, seriesIndex, dataPointIndex, w }) {
      const point = w.config.series[seriesIndex].data[dataPointIndex]
      const value = series[seriesIndex][dataPointIndex]
      if (value === null || value === undefined) return ''
      return renderChartTooltip({
        title: point.dateLabel,
        rows: [{
          label: w.config.series[seriesIndex].name,
          value: `${Number(value).toLocaleString('zh-CN')} 个 IP`,
          color: '#008ffb'
        }]
      })
    }
  }
}))

const discoveredTotal = computed(() =>
  heatmapItems.value.reduce((total, item) => total + (Number(item.count) || 0), 0)
)

const hoveredHeatmapPosition = computed(() => {
  if (!Number.isFinite(hoveredHeatmapValue.value)) return null
  return Math.min(1, Math.max(0, hoveredHeatmapValue.value / heatmapMaximum.value))
})

function scheduleSquareHeatmapCells() {
  if (heatmapResizeFrame) cancelAnimationFrame(heatmapResizeFrame)
  heatmapResizeFrame = requestAnimationFrame(() => {
    heatmapResizeFrame = requestAnimationFrame(() => {
      heatmapResizeFrame = null
      const cell = heatmapChartContainer.value?.querySelector('.apexcharts-heatmap-rect')
      if (!cell) return

      const { width, height } = cell.getBoundingClientRect()
      const heightAdjustment = (width - height) * weekdayRows.length
      if (Math.abs(heightAdjustment) < 1) return
      heatmapChartHeight.value = Math.max(180, Math.round(heatmapChartHeight.value + heightAdjustment))
    })
  })
}

const lastUpdatedLabel = computed(() => {
  if (snapshotDataAsOf.value) {
    return `统计截至 ${formatSystemDateTime(snapshotDataAsOf.value)}`
  }
  if (!lastUpdatedAt.value) return '尚未完成加载'
  return `更新于 ${formatSystemClock(lastUpdatedAt.value)}`
})

onMounted(() => {
  loadScanners()
  loadAnalysis()
  heatmapResizeObserver = new ResizeObserver(scheduleSquareHeatmapCells)
  if (heatmapChartContainer.value) heatmapResizeObserver.observe(heatmapChartContainer.value)
})

watch(() => timeSettings.timezone, () => loadAnalysis())

watch([heatmapSeries, heatmapChartHeight, hasLoadedHeatmap], async () => {
  await nextTick()
  scheduleSquareHeatmapCells()
}, { flush: 'post' })

onBeforeUnmount(() => {
  requestVersion += 1
  analysisController?.abort()
  scannerController?.abort()
  heatmapResizeObserver?.disconnect()
  if (heatmapResizeFrame) cancelAnimationFrame(heatmapResizeFrame)
})
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

  <main class="page-shell">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="page-title">扫描分析</h1>
        <p class="mt-1 text-sm text-base-content/60">按扫描结果查看常见服务、开放端口和每日发现的 IP。</p>
      </div>
      <span class="text-xs text-base-content/50">{{ lastUpdatedLabel }}</span>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body gap-4 p-4">
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <fieldset class="fieldset min-w-0 w-full">
            <legend class="fieldset-legend"><label :for="`${formFieldId}-1`">时间范围</label></legend>
            <select :id="`${formFieldId}-1`" v-model.number="filters.weeks" class="select select-bordered w-full">
              <option v-for="weeks in weekOptions" :key="weeks" :value="weeks">最近 {{ weeks }} 周</option>
            </select>
          </fieldset>

          <fieldset class="fieldset min-w-0 w-full">
            <legend class="fieldset-legend"><label :for="`${formFieldId}-2`">扫描器</label></legend>
            <select :id="`${formFieldId}-2`" v-model="filters.scannerId" class="select select-bordered w-full" :disabled="scannerLoading">
              <option value="">{{ scannerLoading ? '加载扫描器中…' : '全部扫描器' }}</option>
              <option v-for="scanner in scannerList" :key="scanner.id" :value="scanner.id">{{ scanner.name }}</option>
            </select>
          </fieldset>

          <fieldset class="fieldset min-w-0 w-full">
            <legend class="fieldset-legend"><label :for="`${formFieldId}-3`">任务来源</label></legend>
            <select :id="`${formFieldId}-3`" v-model="filters.taskSource" class="select select-bordered w-full">
              <option value="">全部来源</option>
              <option value="manual">手动任务</option>
              <option value="automatic">自动任务</option>
              <option value="search">搜索生成</option>
            </select>
          </fieldset>

          <fieldset class="fieldset min-w-0 w-full">
            <legend class="fieldset-legend"><label :for="`${formFieldId}-4`">分布维度</label></legend>
            <select :id="`${formFieldId}-4`" v-model="filters.dimension" class="select select-bordered w-full">
              <option value="service">识别服务</option>
              <option value="port">开放端口</option>
            </select>
          </fieldset>

          <fieldset class="fieldset min-w-0 w-full">
            <legend class="fieldset-legend"><label :for="`${formFieldId}-5`">显示数量</label></legend>
            <select :id="`${formFieldId}-5`" v-model.number="filters.topN" class="select select-bordered w-full">
              <option v-for="item in topOptions" :key="item" :value="item">Top {{ item }}</option>
            </select>
          </fieldset>
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
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold">常见{{ activeFilters.dimension === 'service' ? '服务' : '端口' }}分布</h2>
              <p class="mt-1 text-xs text-base-content/60">按唯一 IP、端口和任务执行去重，Top N 之外合并为“其他”。</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="badge badge-ghost whitespace-nowrap">共 {{ distributionData.total.toLocaleString('zh-CN') }} 个端点</span>
              <ChartCsvExport
                :filename="`${activeFilters.dimension}-distribution`"
                :series="pieSeries"
                :options="pieOptions"
                :category-header="activeFilters.dimension === 'service' ? '服务' : '端口'"
                value-header="端点数"
                :disabled="distributionLoading || !hasLoadedDistribution || distributionData.total === 0"
              />
            </div>
          </div>

          <div v-if="distributionLoading && !hasLoadedDistribution" class="mt-4 skeleton h-80 w-full rounded-box"></div>
          <EmptyState
            v-else-if="distributionFailed && !hasLoadedDistribution"
            class="mt-4"
            type="error"
            title="服务分布加载失败"
            :message="distributionError"
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
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold">发现 IP 热力图</h2>
              <p class="mt-1 text-xs text-base-content/60">按自然日统计去重 IP；无发现显示为 0，未来日期留空。</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="badge badge-ghost whitespace-nowrap">累计 {{ discoveredTotal.toLocaleString('zh-CN') }}</span>
              <ChartCsvExport
                filename="discovered-ip-heatmap"
                :series="heatmapSeries"
                :options="heatmapOptions"
                category-header="日期"
                value-header="发现 IP 数"
                :disabled="heatmapLoading || !hasLoadedHeatmap"
              />
            </div>
          </div>

          <div v-if="heatmapLoading && !hasLoadedHeatmap" class="mt-4 skeleton h-96 w-full rounded-box"></div>
          <EmptyState
            v-else-if="heatmapFailed && !hasLoadedHeatmap"
            class="mt-4"
            type="error"
            title="热力图加载失败"
            :message="heatmapError"
          />
          <div v-else ref="heatmapChartContainer" class="relative mt-2 flex items-stretch gap-3">
            <div class="min-w-0 flex-1">
              <ApexChart type="heatmap" :height="heatmapChartHeight" :options="heatmapOptions" :series="heatmapSeries" />
            </div>
            <span v-if="heatmapLoading" class="loading loading-spinner loading-sm absolute top-2 right-2"></span>
            <div v-if="hasLoadedHeatmap" class="flex shrink-0 flex-col items-center text-xs text-base-content/60">
              <span>发现 IP</span>
              <div class="relative mt-1 h-56 w-14">
                <span class="absolute left-0 top-0">{{ heatmapMaximum.toLocaleString('zh-CN') }}</span>
                <span class="absolute bottom-0 left-0">0</span>
                <div class="absolute inset-y-4 left-7 w-3 rounded-sm border border-base-300" style="background: linear-gradient(to top, #e0f2fe 0%, #008ffb 100%)">
                  <div
                    v-if="hoveredHeatmapPosition !== null"
                    class="absolute left-full -translate-y-1/2"
                    :style="{ top: `${(1 - hoveredHeatmapPosition) * 100}%` }"
                  >
                    <span class="block h-0 w-0 border-y-4 border-r-6 border-y-transparent border-r-base-content"></span>
                    <span class="absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-base-200 px-1 py-0.5 font-medium text-base-content shadow-sm">{{ hoveredHeatmapValue.toLocaleString('zh-CN') }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>
