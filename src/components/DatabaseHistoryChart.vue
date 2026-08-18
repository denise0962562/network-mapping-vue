<script setup>
import axios from 'axios'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import http from '@/utils/http'

const ApexChart = defineAsyncComponent(() => import('vue3-apexcharts'))
const emit = defineEmits(['error'])

const DEFAULT_RANGE_MILLISECONDS = 30 * 60 * 1000
const MAX_SELECTED_TABLES = 6
const chartColors = ['#008ffb', '#00a76f', '#f59e0b', '#775dd0', '#ff4560', '#00b8d9', '#8bc34a', '#ff8f00']

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
  { value: '1m', label: '1 分钟', seconds: 60 },
  { value: '5m', label: '5 分钟', seconds: 300 },
  { value: '15m', label: '15 分钟', seconds: 900 },
  { value: '30m', label: '30 分钟', seconds: 1800 },
  { value: '1h', label: '1 小时', seconds: 3600 },
  { value: '2h', label: '2 小时', seconds: 7200 },
  { value: '6h', label: '6 小时', seconds: 21600 }
]
const tableCategoryDefinitions = [
  {
    id: 'mapping',
    label: '测绘数据',
    tables: ['ips', 'ports', 'scaninfo', 'scan_result_batch', 'scan_observation']
  },
  {
    id: 'tasks',
    label: '任务与扫描器',
    tables: ['scan_task', 'scan_task_execution', 'automatic_target_state', 'scanner_info']
  },
  {
    id: 'logs',
    label: '日志数据',
    tables: ['system_status', 'login_logs', 'operation_audit', 'audit_event', 'request_log']
  },
  {
    id: 'network',
    label: '网络情报',
    tables: ['ip_list', 'country', 'org', 'asn', 'isp']
  },
  {
    id: 'system',
    label: '系统与配置',
    tables: ['users', 'session', 'setting', 'mail_template', 'mail_template_version']
  }
]

function compareNames(left, right) {
  return left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' })
}

function toLocalInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
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
const tableNames = ref([])
const selectedTables = ref([])
const meta = ref(null)
const loading = ref(false)
const failed = ref(false)
const hasLoaded = ref(false)
const lastUpdatedAt = ref(null)

function unqualifiedTableName(name) {
  return name.split('.').at(-1)
}

const categorizedTableNames = new Set(tableCategoryDefinitions.flatMap((category) => category.tables))

const availableTableCategories = computed(() => {
  const categories = tableCategoryDefinitions
    .map((category) => ({
      ...category,
      tableNames: tableNames.value
        .filter((name) => category.tables.includes(unqualifiedTableName(name)))
        .sort(compareNames)
    }))
    .filter((category) => category.tableNames.length > 0)
  const uncategorizedTables = tableNames.value
    .filter((name) => !categorizedTableNames.has(unqualifiedTableName(name)))
    .sort(compareNames)

  if (uncategorizedTables.length > 0) {
    categories.push({ id: 'other', label: '其他数据', tables: [], tableNames: uncategorizedTables })
  }
  return categories
})

let requestController = null
let refreshTimer = null
let requestVersion = 0
let selectionInitialized = false

function selectedRangeMilliseconds() {
  if (range.value !== 'custom') {
    return rangeOptions.find((item) => item.value === range.value)?.milliseconds ?? null
  }
  const start = new Date(customStart.value)
  const end = new Date(customEnd.value)
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
    start = new Date(customStart.value)
    end = new Date(customEnd.value)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('请选择有效的开始和结束时间。')
    }
  } else {
    end = new Date()
    start = new Date(end.getTime() - selectedRangeMilliseconds())
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

function latestPointWithTables(historyPoints) {
  return [...historyPoints].reverse().find((point) => Object.keys(point.tables || {}).length > 0) || null
}

function defaultSelectedTables(names, historyPoints) {
  const latest = latestPointWithTables(historyPoints)
  return [...names]
    .sort((left, right) => {
      const sizeDifference = Number(latest?.tables?.[right]?.total || 0) - Number(latest?.tables?.[left]?.total || 0)
      return sizeDifference || compareNames(left, right)
    })
    .slice(0, MAX_SELECTED_TABLES)
    .sort(compareNames)
}

function updateTableSelection(names, historyPoints) {
  const available = new Set(names)
  const retained = selectedTables.value.filter((name) => available.has(name)).sort(compareNames)
  if (!selectionInitialized || (retained.length === 0 && names.length > 0)) {
    selectedTables.value = defaultSelectedTables(names, historyPoints)
    selectionInitialized = true
  } else {
    selectedTables.value = retained
  }
}

async function loadHistory({ silent = false } = {}) {
  let params
  try {
    params = buildRequestParams()
  } catch (error) {
    emit('error', { title: '数据库趋势查询失败', description: error.message })
    return
  }

  const version = ++requestVersion
  requestController?.abort()
  requestController = new AbortController()
  loading.value = true
  try {
    const response = await http.get('/api/data/database-size-history', {
      params,
      signal: requestController.signal
    })
    const responsePoints = response.data?.data?.points
    const responseTableNames = response.data?.data?.table_names
    if (response.data?.success !== true || !Array.isArray(responsePoints) || !Array.isArray(responseTableNames)) {
      throw new Error('服务器未返回有效的数据库容量数据。')
    }
    if (version !== requestVersion) return
    const names = [...new Set(responseTableNames.map(String))].sort(compareNames)
    points.value = responsePoints
    tableNames.value = names
    updateTableSelection(names, responsePoints)
    meta.value = response.data.meta || null
    failed.value = false
    hasLoaded.value = true
    lastUpdatedAt.value = new Date()
  } catch (error) {
    if (version !== requestVersion || axios.isCancel(error)) return
    console.error('load database size history failed', error)
    failed.value = !hasLoaded.value
    if (!silent) {
      emit('error', {
        title: '数据库趋势加载失败',
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

function toggleTable(name) {
  if (selectedTables.value.includes(name)) {
    selectedTables.value = selectedTables.value.filter((item) => item !== name)
    return
  }
  if (selectedTables.value.length >= MAX_SELECTED_TABLES) return
  selectedTables.value = [...selectedTables.value, name].sort(compareNames)
}

function categorySelection(category) {
  const latest = latestPointWithTables(points.value)
  return [...category.tableNames]
    .sort((left, right) => {
      const sizeDifference = Number(latest?.tables?.[right]?.total || 0) - Number(latest?.tables?.[left]?.total || 0)
      return sizeDifference || compareNames(left, right)
    })
    .slice(0, MAX_SELECTED_TABLES)
    .sort(compareNames)
}

function selectTableCategory(category) {
  selectedTables.value = categorySelection(category)
  selectionInitialized = true
}

function tableCategoryActive(category) {
  const categoryTables = categorySelection(category)
  return categoryTables.length === selectedTables.value.length
    && categoryTables.every((name, index) => name === [...selectedTables.value].sort(compareNames)[index])
}

function formatBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '--'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const precision = unitIndex === 0 ? 0 : 1
  return `${(bytes / (1024 ** unitIndex)).toFixed(precision)} ${units[unitIndex]}`
}

function formatGrowth(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes)) return '--'
  if (bytes === 0) return '0 B'
  return `${bytes > 0 ? '+' : '-'}${formatBytes(Math.abs(bytes))}`
}

function colorForTable(name) {
  let hash = 0
  for (const character of name) hash = ((hash << 5) - hash + character.codePointAt(0)) | 0
  return chartColors[Math.abs(hash) % chartColors.length]
}

const latestPoint = computed(() =>
  [...points.value].reverse().find((point) =>
    Number.isFinite(point.database_size) || Number.isFinite(point.connection_count) || Object.keys(point.tables || {}).length > 0
  ) || null
)

const firstDatabaseSize = computed(() =>
  points.value.find((point) => Number.isFinite(point.database_size))?.database_size ?? null
)

const databaseGrowth = computed(() => {
  if (!Number.isFinite(latestPoint.value?.database_size) || !Number.isFinite(firstDatabaseSize.value)) return null
  return latestPoint.value.database_size - firstDatabaseSize.value
})

const databaseStats = computed(() => [
  { name: '数据库总大小', value: formatBytes(latestPoint.value?.database_size), class: 'text-info' },
  { name: '区间增长', value: formatGrowth(databaseGrowth.value), class: databaseGrowth.value > 0 ? 'text-warning' : 'text-success' },
  { name: '当前连接数', value: Number.isFinite(latestPoint.value?.connection_count) ? String(latestPoint.value.connection_count) : '--', class: 'text-secondary' }
])

const chartSeries = computed(() =>
  [...selectedTables.value].sort(compareNames).map((name) => ({
    name,
    data: points.value.map((point) => ({
      x: point.timestamp_ms,
      y: Number.isFinite(point.tables?.[name]?.total) ? point.tables[name].total : null
    }))
  }))
)

const hasMetrics = computed(() =>
  chartSeries.value.some((series) => series.data.some((point) => Number.isFinite(point.y)))
)

const selectedTableDetails = computed(() =>
  [...selectedTables.value]
    .sort(compareNames)
    .map((name) => ({ name, ...(latestPoint.value?.tables?.[name] || {}) }))
)

const chartOptions = computed(() => ({
  chart: {
    type: 'line',
    height: 420,
    animations: { enabled: false },
    zoom: { enabled: true, type: 'x', autoScaleYaxis: true },
    toolbar: { show: true, autoSelected: 'zoom' }
  },
  colors: [...selectedTables.value].sort(compareNames).map(colorForTable),
  dataLabels: { enabled: false },
  stroke: { curve: 'straight', width: 2 },
  markers: { size: 0, hover: { size: 4 } },
  legend: { position: 'top', horizontalAlign: 'left' },
  xaxis: { type: 'datetime', labels: { datetimeUTC: false } },
  yaxis: { min: 0, labels: { formatter: formatBytes } },
  grid: { borderColor: 'rgba(128, 128, 128, 0.18)' },
  tooltip: {
    shared: true,
    intersect: false,
    x: { format: 'yyyy-MM-dd HH:mm:ss' },
    y: { formatter: formatBytes }
  },
  responsive: [{ breakpoint: 640, options: { chart: { height: 360 } } }]
}))

const totalSamples = computed(() =>
  points.value.reduce((total, point) => total + (Number(point.sample_count) || 0), 0)
)

const statusLabel = computed(() => {
  if (!lastUpdatedAt.value) return '尚未完成加载'
  const granularityLabel = meta.value?.granularity || granularity.value
  return `粒度 ${granularityLabel} · ${points.value.length} 个时间点 · ${totalSamples.value.toLocaleString('zh-CN')} 个样本 · 更新于 ${lastUpdatedAt.value.toLocaleTimeString('zh-CN', { hour12: false })}`
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
        <h2 class="text-lg font-semibold">数据库容量趋势</h2>
        <p class="mt-1 text-xs text-base-content/60">展示所选用户表的总大小；每个时间桶采用最后一次容量快照。</p>
      </div>

      <div class="flex flex-wrap items-end justify-end gap-2">
        <details class="dropdown dropdown-end">
          <summary class="btn btn-outline btn-sm min-w-36">数据表 {{ selectedTables.length }}/{{ tableNames.length }}</summary>
          <div class="dropdown-content z-20 mt-2 w-80 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
            <div v-if="tableNames.length === 0" class="px-2 py-3 text-sm text-base-content/50">暂无表信息</div>
            <div v-else>
              <div class="px-2 pb-1">
                <div class="mb-1 text-xs font-medium">快捷选择</div>
                <div class="mb-2 text-[11px] text-base-content/50">点击分类会替换当前选择，最多展示 {{ MAX_SELECTED_TABLES }} 张表</div>
                <div class="grid grid-cols-2 gap-1">
                  <button
                    v-for="category in availableTableCategories"
                    :key="category.id"
                    type="button"
                    class="btn btn-ghost btn-sm h-auto min-h-8 justify-between px-2 font-normal"
                    :class="{ 'btn-active': tableCategoryActive(category) }"
                    @click="selectTableCategory(category)"
                  >
                    <span class="truncate">{{ category.label }}</span>
                    <span class="badge badge-ghost badge-sm">{{ category.tableNames.length }}</span>
                  </button>
                </div>
              </div>

              <div class="divider my-1 px-2 text-[11px] text-base-content/50">具体数据表</div>

              <div class="max-h-64 overflow-y-auto">
                <label v-for="name in tableNames" :key="name" class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-base-200">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    :checked="selectedTables.includes(name)"
                    :disabled="!selectedTables.includes(name) && selectedTables.length >= MAX_SELECTED_TABLES"
                    @change="toggleTable(name)"
                  />
                  <span class="truncate text-sm" :title="name">{{ name }}</span>
                </label>
              </div>
            </div>
          </div>
        </details>

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

        <button class="btn btn-neutral btn-sm" :disabled="loading" @click="loadHistory()">
          <span v-if="loading" class="loading loading-spinner loading-xs"></span>
          {{ loading ? '加载中…' : '应用' }}
        </button>
      </div>
    </div>

    <div v-if="range === 'custom'" class="grid gap-3 rounded-box bg-base-200/60 p-3 sm:grid-cols-2">
      <label class="form-control w-full">
        <span class="label-text mb-1 text-xs">开始时间</span>
        <input v-model="customStart" type="datetime-local" class="input input-bordered input-sm w-full" :disabled="loading" @change="ensureValidGranularity" />
      </label>
      <label class="form-control w-full">
        <span class="label-text mb-1 text-xs">结束时间</span>
        <input v-model="customEnd" type="datetime-local" class="input input-bordered input-sm w-full" :disabled="loading" @change="ensureValidGranularity" />
      </label>
    </div>

    <div v-if="hasLoaded" class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div v-for="item in databaseStats" :key="item.name" class="rounded-box border border-base-300 bg-base-200/40 px-4 py-3">
        <div class="text-xs text-base-content/60">{{ item.name }}</div>
        <div class="mt-1 text-xl font-semibold" :class="item.class">{{ item.value }}</div>
      </div>
    </div>

    <div v-if="loading && !hasLoaded" class="skeleton h-96 w-full rounded-box"></div>
    <EmptyState
      v-else-if="failed && !hasLoaded"
      type="error"
      title="数据库趋势加载失败"
      message="无法从服务器读取数据库容量历史，请稍后重试。"
    />
    <EmptyState
      v-else-if="selectedTables.length === 0"
      title="请选择数据表"
      message="当前范围内没有可展示的表，或尚未选择数据表。"
    />
    <EmptyState
      v-else-if="!hasMetrics"
      title="暂无容量数据"
      message="所选数据表在当前时间范围内没有可用于绘图的记录。"
    />
    <div v-else class="relative">
      <ApexChart type="line" height="420" :options="chartOptions" :series="chartSeries" />
      <span v-if="loading" class="loading loading-spinner loading-sm absolute top-2 right-2"></span>
    </div>

    <div v-if="selectedTableDetails.length > 0" class="overflow-x-auto rounded-box border border-base-300">
      <table class="table table-sm">
        <thead>
          <tr>
            <th>数据表</th>
            <th class="text-right">数据</th>
            <th class="text-right">索引</th>
            <th class="text-right">总大小</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="table in selectedTableDetails" :key="table.name">
            <td class="font-mono text-xs">{{ table.name }}</td>
            <td class="text-right">{{ formatBytes(table.data) }}</td>
            <td class="text-right">{{ formatBytes(table.index) }}</td>
            <td class="text-right font-medium">{{ formatBytes(table.total) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="text-right text-xs text-base-content/50">{{ statusLabel }}</div>
  </div>
</template>
