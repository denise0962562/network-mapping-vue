<script setup>
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
const MAX_SELECTED_ITEMS = 6
const POSTGRESQL_PREFIX = 'postgresql:'
const ELASTICSEARCH_PREFIX = 'elasticsearch:'
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
const elasticsearchIndexNames = ref([])
const selectedItems = ref([])
const meta = ref(null)
const loading = ref(false)
const failed = ref(false)
const hasLoaded = ref(false)
const lastUpdatedAt = ref(null)
const { maintenanceAnnotations, maintenanceChartRef, maintenanceTooltip, showMaintenanceTooltip, hideMaintenanceTooltip, applyMaintenanceAnnotations } = useSystemMaintenanceAnnotations()

function unqualifiedTableName(name) {
  return name.split('.').at(-1)
}

function storageKey(engine, name) {
  return `${engine === 'postgresql' ? POSTGRESQL_PREFIX : ELASTICSEARCH_PREFIX}${name}`
}

function storageEngine(key) {
  return key.startsWith(ELASTICSEARCH_PREFIX) ? 'elasticsearch' : 'postgresql'
}

function storageName(key) {
  return key.slice(key.indexOf(':') + 1)
}

function storageLabel(key) {
  return `${storageEngine(key) === 'postgresql' ? 'PG' : 'ES'} · ${storageName(key)}`
}

function storageMetrics(point, key) {
  const name = storageName(key)
  return storageEngine(key) === 'postgresql'
    ? point?.tables?.[name]
    : point?.elasticsearch_indices?.[name]
}

const availableStorageItems = computed(() => [
  ...tableNames.value.map((name) => ({ key: storageKey('postgresql', name), name, engine: 'postgresql' })),
  ...elasticsearchIndexNames.value.map((name) => ({ key: storageKey('elasticsearch', name), name, engine: 'elasticsearch' }))
])

const categorizedTableNames = new Set(tableCategoryDefinitions.flatMap((category) => category.tables))

const availableStorageCategories = computed(() => {
  const categories = tableCategoryDefinitions
    .map((category) => ({
      ...category,
      itemKeys: tableNames.value
        .filter((name) => category.tables.includes(unqualifiedTableName(name)))
        .map((name) => storageKey('postgresql', name))
        .sort(compareNames)
    }))
    .filter((category) => category.itemKeys.length > 0)
  const uncategorizedTables = tableNames.value
    .filter((name) => !categorizedTableNames.has(unqualifiedTableName(name)))
    .map((name) => storageKey('postgresql', name))
    .sort(compareNames)

  if (uncategorizedTables.length > 0) {
    categories.push({ id: 'other', label: '其他 PostgreSQL', tables: [], itemKeys: uncategorizedTables })
  }
  if (elasticsearchIndexNames.value.length > 0) {
    categories.push({
      id: 'elasticsearch',
      label: 'Elasticsearch 索引',
      tables: [],
      itemKeys: elasticsearchIndexNames.value.map((name) => storageKey('elasticsearch', name)).sort(compareNames)
    })
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

function latestPointWithStorage(historyPoints) {
  return [...historyPoints].reverse().find((point) =>
    Object.keys(point.tables || {}).length > 0 || Object.keys(point.elasticsearch_indices || {}).length > 0
  ) || null
}

function defaultSelectedItems(keys, historyPoints) {
  const latest = latestPointWithStorage(historyPoints)
  return [...keys]
    .sort((left, right) => {
      const sizeDifference = Number(storageMetrics(latest, right)?.total || 0) - Number(storageMetrics(latest, left)?.total || 0)
      return sizeDifference || compareNames(storageLabel(left), storageLabel(right))
    })
    .slice(0, MAX_SELECTED_ITEMS)
    .sort(compareNames)
}

function updateStorageSelection(keys, historyPoints) {
  const available = new Set(keys)
  const retained = selectedItems.value.filter((key) => available.has(key)).sort(compareNames)
  if (!selectionInitialized || (retained.length === 0 && keys.length > 0)) {
    selectedItems.value = defaultSelectedItems(keys, historyPoints)
    selectionInitialized = true
  } else {
    selectedItems.value = retained
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
    const responseElasticsearchIndexNames = response.data?.data?.elasticsearch_index_names ?? []
    if (
      response.data?.success !== true
      || !Array.isArray(responsePoints)
      || !Array.isArray(responseTableNames)
      || !Array.isArray(responseElasticsearchIndexNames)
    ) {
      throw new Error('服务器未返回有效的数据库容量数据。')
    }
    if (version !== requestVersion) return
    const names = [...new Set(responseTableNames.map(String))].sort(compareNames)
    const indexNames = [...new Set(responseElasticsearchIndexNames.map(String))].sort(compareNames)
    const keys = [
      ...names.map((name) => storageKey('postgresql', name)),
      ...indexNames.map((name) => storageKey('elasticsearch', name))
    ]
    points.value = responsePoints
    tableNames.value = names
    elasticsearchIndexNames.value = indexNames
    updateStorageSelection(keys, responsePoints)
    meta.value = response.data.meta || null
    failed.value = false
    hasLoaded.value = true
    lastUpdatedAt.value = new Date()
    void loadMaintenanceAnnotations(params, version)
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

function toggleStorageItem(key) {
  if (selectedItems.value.includes(key)) {
    selectedItems.value = selectedItems.value.filter((item) => item !== key)
    return
  }
  if (selectedItems.value.length >= MAX_SELECTED_ITEMS) return
  selectedItems.value = [...selectedItems.value, key].sort(compareNames)
}

function categorySelection(category) {
  const latest = latestPointWithStorage(points.value)
  return [...category.itemKeys]
    .sort((left, right) => {
      const sizeDifference = Number(storageMetrics(latest, right)?.total || 0) - Number(storageMetrics(latest, left)?.total || 0)
      return sizeDifference || compareNames(storageLabel(left), storageLabel(right))
    })
    .slice(0, MAX_SELECTED_ITEMS)
    .sort(compareNames)
}

function selectStorageCategory(category) {
  selectedItems.value = categorySelection(category)
  selectionInitialized = true
}

function storageCategoryActive(category) {
  const categoryItems = categorySelection(category)
  return categoryItems.length === selectedItems.value.length
    && categoryItems.every((key, index) => key === [...selectedItems.value].sort(compareNames)[index])
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

function colorForStorage(key) {
  let hash = 0
  for (const character of key) hash = ((hash << 5) - hash + character.codePointAt(0)) | 0
  return chartColors[Math.abs(hash) % chartColors.length]
}

const latestPoint = computed(() =>
  [...points.value].reverse().find((point) =>
    Number.isFinite(point.database_size)
    || Number.isFinite(point.connection_count)
    || Number.isFinite(point.elasticsearch_total_size)
    || Object.keys(point.tables || {}).length > 0
    || Object.keys(point.elasticsearch_indices || {}).length > 0
  ) || null
)

function combinedStorageSize(point, requireElasticsearch = false) {
  const postgresql = point?.database_size
  const elasticsearch = point?.elasticsearch_total_size
  if (!Number.isFinite(postgresql)) return null
  if (requireElasticsearch && !Number.isFinite(elasticsearch)) return null
  return postgresql + (Number.isFinite(elasticsearch) ? elasticsearch : 0)
}

const latestCombinedSize = computed(() => combinedStorageSize(latestPoint.value))
const firstCombinedSize = computed(() => {
  const requireElasticsearch = Number.isFinite(latestPoint.value?.elasticsearch_total_size)
  return points.value
    .map((point) => combinedStorageSize(point, requireElasticsearch))
    .find(Number.isFinite) ?? null
})

const databaseGrowth = computed(() => {
  if (!Number.isFinite(latestCombinedSize.value) || !Number.isFinite(firstCombinedSize.value)) return null
  return latestCombinedSize.value - firstCombinedSize.value
})

const databaseStats = computed(() => [
  {
    name: 'PostgreSQL 总大小',
    value: formatBytes(latestPoint.value?.database_size),
    description: '数据库实际占用',
    class: 'text-info'
  },
  {
    name: 'Elasticsearch 实际占用',
    value: Number.isFinite(latestPoint.value?.elasticsearch_total_size)
      ? formatBytes(latestPoint.value.elasticsearch_total_size)
      : latestPoint.value?.elasticsearch_enabled ? '暂不可用' : '未启用',
    description: Number.isFinite(latestPoint.value?.elasticsearch_total_size)
      ? `主分片 ${formatBytes(latestPoint.value.elasticsearch_primary_size)} · 副本 ${formatBytes(latestPoint.value.elasticsearch_replica_size)}`
      : '仅统计本项目索引',
    class: 'text-primary'
  },
  {
    name: '合计区间增长',
    value: formatGrowth(databaseGrowth.value),
    description: 'PostgreSQL 与 ES 实际占用',
    class: databaseGrowth.value > 0 ? 'text-warning' : 'text-success'
  },
  {
    name: 'PostgreSQL 当前连接数',
    value: Number.isFinite(latestPoint.value?.connection_count) ? String(latestPoint.value.connection_count) : '--',
    description: '当前容量快照',
    class: 'text-secondary'
  }
])

const chartSeries = computed(() =>
  [...selectedItems.value].sort(compareNames).map((key) => ({
    name: storageLabel(key),
    color: colorForStorage(key),
    data: points.value.map((point) => ({
      x: point.timestamp_ms,
      y: Number.isFinite(storageMetrics(point, key)?.total) ? storageMetrics(point, key).total : null
    }))
  }))
)

const hasMetrics = computed(() =>
  chartSeries.value.some((series) => series.data.some((point) => Number.isFinite(point.y)))
)

const selectedStorageDetails = computed(() =>
  [...selectedItems.value]
    .sort(compareNames)
    .map((key) => {
      const engine = storageEngine(key)
      const metrics = storageMetrics(latestPoint.value, key) || {}
      return {
        key,
        engine,
        name: storageName(key),
        primary: engine === 'postgresql' ? metrics.data : metrics.primary,
        overhead: engine === 'postgresql' ? metrics.index : metrics.replica,
        total: metrics.total
      }
    })
)

const chartOptions = computed(() => ({
  chart: {
    type: 'line',
    height: 420,
    animations: { enabled: false },
    zoom: { enabled: true, type: 'x', autoScaleYaxis: true },
    toolbar: { show: true, autoSelected: 'zoom' }
  },
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
    custom({ dataPointIndex }) {
      const point = points.value[dataPointIndex]
      if (!point) return ''
      const rows = [...selectedItems.value]
        .sort(compareNames)
        .map((key) => ({
          label: storageLabel(key),
          value: formatBytes(storageMetrics(point, key)?.total),
          color: colorForStorage(key)
        }))
      return renderChartTooltip({
        title: formatChartTooltipTime(point.timestamp_ms),
        rows,
        footer: `样本数 ${Number(point.sample_count).toLocaleString('zh-CN')}`
      })
    }
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
        <p class="mt-1 text-xs text-base-content/60">展示 PostgreSQL 表与 Elasticsearch 索引的总大小；每个时间桶采用最后一次容量快照。</p>
      </div>

      <div class="flex flex-wrap items-end justify-end gap-2">
        <details class="dropdown dropdown-end">
          <summary class="btn btn-outline btn-sm min-w-36">存储对象 {{ selectedItems.length }}/{{ availableStorageItems.length }}</summary>
          <div class="dropdown-content z-20 mt-2 w-80 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
            <div v-if="availableStorageItems.length === 0" class="px-2 py-3 text-sm text-base-content/50">暂无存储对象</div>
            <div v-else>
              <div class="px-2 pb-1">
                <div class="mb-1 text-xs font-medium">快捷选择</div>
                <div class="mb-2 text-[11px] text-base-content/50">点击分类会替换当前选择，最多展示 {{ MAX_SELECTED_ITEMS }} 个对象</div>
                <div class="grid grid-cols-2 gap-1">
                  <button
                    v-for="category in availableStorageCategories"
                    :key="category.id"
                    type="button"
                    class="btn btn-ghost btn-sm h-auto min-h-8 justify-between px-2 font-normal"
                    :class="{ 'btn-active': storageCategoryActive(category) }"
                    @click="selectStorageCategory(category)"
                  >
                    <span class="truncate">{{ category.label }}</span>
                    <span class="badge badge-ghost badge-sm">{{ category.itemKeys.length }}</span>
                  </button>
                </div>
              </div>

              <div class="divider my-1 px-2 text-[11px] text-base-content/50">具体存储对象</div>

              <div class="max-h-64 overflow-y-auto">
                <label v-for="item in availableStorageItems" :key="item.key" class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-base-200">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    :checked="selectedItems.includes(item.key)"
                    :disabled="!selectedItems.includes(item.key) && selectedItems.length >= MAX_SELECTED_ITEMS"
                    @change="toggleStorageItem(item.key)"
                  />
                  <span class="badge badge-sm" :class="item.engine === 'postgresql' ? 'badge-info' : 'badge-primary'">
                    {{ item.engine === 'postgresql' ? 'PG' : 'ES' }}
                  </span>
                  <span class="truncate text-sm" :title="item.name">{{ item.name }}</span>
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

    <div v-if="hasLoaded" class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div v-for="item in databaseStats" :key="item.name" class="rounded-box border border-base-300 bg-base-200/40 px-4 py-3">
        <div class="text-xs text-base-content/60">{{ item.name }}</div>
        <div class="mt-1 text-xl font-semibold" :class="item.class">{{ item.value }}</div>
        <div class="mt-1 text-[11px] text-base-content/50">{{ item.description }}</div>
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
      v-else-if="selectedItems.length === 0"
      title="请选择存储对象"
      message="当前范围内没有可展示的 PostgreSQL 表或 Elasticsearch 索引。"
    />
    <EmptyState
      v-else-if="!hasMetrics"
      title="暂无容量数据"
      message="所选存储对象在当前时间范围内没有可用于绘图的记录。"
    />
    <div v-else class="relative">
      <ApexChart ref="maintenanceChartRef" type="line" height="420" :options="chartOptions" :series="chartSeries" @mounted="applyMaintenanceAnnotations" />
      <SystemMaintenanceTooltip :tooltip="maintenanceTooltip" />
      <span v-if="loading" class="loading loading-spinner loading-sm absolute top-2 right-2"></span>
    </div>

    <div v-if="selectedStorageDetails.length > 0" class="overflow-x-auto rounded-box border border-base-300">
      <table class="table table-sm">
        <thead>
          <tr>
            <th>存储</th>
            <th>对象</th>
            <th class="text-right">数据 / 主分片</th>
            <th class="text-right">索引 / 副本</th>
            <th class="text-right">总大小</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in selectedStorageDetails" :key="item.key">
            <td>
              <span class="badge badge-sm" :class="item.engine === 'postgresql' ? 'badge-info' : 'badge-primary'">
                {{ item.engine === 'postgresql' ? 'PostgreSQL' : 'Elasticsearch' }}
              </span>
            </td>
            <td class="font-mono text-xs">{{ item.name }}</td>
            <td class="text-right">{{ formatBytes(item.primary) }}</td>
            <td class="text-right">{{ formatBytes(item.overhead) }}</td>
            <td class="text-right font-medium">{{ formatBytes(item.total) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="text-right text-xs text-base-content/50">{{ statusLabel }}</div>
  </div>
</template>
