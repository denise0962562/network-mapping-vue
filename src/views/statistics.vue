<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch, useId } from 'vue'
import http from '@/utils/http'
import AppAlert from '@/components/AppAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import StatisticsChart from '@/components/StatisticsChart.vue'
import StatisticsDetails from '@/components/StatisticsDetails.vue'
import StatisticsOverview from '@/components/StatisticsOverview.vue'
import { addCalendarDays, calendarDate, formatDateTime, timeSettings } from '@/utils/systemTime'
import { enrichStatistics, metricDifference, availableCharts, chartLabels, chartRows, defaultFilters, downloadBlob, formatMetric, groupLabels, imageCaption, metrics, queryBody, rowLabel, statisticsCsv } from '@/utils/statistics'

const formFieldId = useId()
const types = ref([])
const scanners = ref([])
const filters = ref(defaultFilters())
const overview = ref(true)
const overviewFilters = ref(defaultFilters())
const overviewKey = ref(0)
const overviewApplied = ref('')
const loading = ref(false)
const initializing = ref(true)
const error = ref('')
const scannerError = ref('')
const exportError = ref('')
const result = ref(null)
const detailRow = ref(null)
const applied = ref('')
const display = ref({ metric: 'count', chart: 'line', top: 10, title: '' })
const image = ref({ format: 'png', width: 1400, background: 'white' })
const exporting = ref(false)
const chartRef = ref(null)
const page = ref(1)
const search = ref('')
const pageSize = ref(20)
const sort = ref({ key: 'label', direction: 1 })
let controller
let setupController
let disposed = false

const selectedType = computed(() => types.value.find((t) => t.id === filters.value.data_type))
const activeType = computed(() => types.value.find((t) => t.id === result.value?.meta.data_type))
const fingerprint = computed(() => JSON.stringify({ ...filters.value, range: undefined, timezone: timeSettings.timezone }))
const dirty = computed(() => overview.value ? !!overviewApplied.value && overviewApplied.value !== fingerprint.value : !!result.value && applied.value !== fingerprint.value)
const charts = computed(() => availableCharts(activeType.value, result.value?.meta.group_by, display.value.metric))
const plottedRows = computed(() => result.value ? chartRows(result.value.data.rows, result.value.meta, display.value.top, display.value.metric) : [])
const canExport = computed(() => result.value && !error.value && !dirty.value && !loading.value && !exporting.value && hasData.value)
const hasData = computed(() => !!result.value && Object.entries(result.value.data.summary).some(([key, value]) => !['success_rate', 'avg_duration_ms', 'p95_ms'].includes(key) && Number(value) > 0))
const title = computed(() => display.value.title.trim() || `${activeType.value?.label || ''}统计`)
const summaryKeys = computed(() => {
  const kind = result.value?.meta.data_type
  if (kind === 'discovery') return ['unique_ips', 'observed_days', 'mean_count', 'peak_count'].filter((key) => key in result.value.data.summary)
  if (['port', 'service'].includes(kind)) return ['count', 'categories', 'top5_share']
  if (kind === 'tasks') return ['created', 'completed', 'succeeded', 'failed', 'partial', 'cancelled', 'success_rate', 'failure_rate']
  return ['completed', 'succeeded', 'failed', 'partial', 'cancelled', 'success_rate', 'failure_rate', 'avg_duration_ms', ...(result.value.meta.metrics?.includes('p95_ms') ? ['p50_ms', 'p95_ms'] : [])]
})
const sortedRows = computed(() => {
  const rows = (result.value?.data.rows || []).filter((row) => rowLabel(row.label, result.value.meta.group_by).toLowerCase().includes(search.value.trim().toLowerCase()))
  const { key, direction } = sort.value
  return rows.sort((a, b) => {
    if (a[key] == null) return b[key] == null ? 0 : 1
    if (b[key] == null) return -1
    const compared = key === 'label' ? String(a[key]).localeCompare(String(b[key]), 'zh-CN') : a[key] - b[key]
    return direction * compared
  })
})
const pages = computed(() => Math.max(1, Math.ceil(sortedRows.value.length / pageSize.value)))
const pagedRows = computed(() => sortedRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const visibleMetrics = computed(() => (result.value?.meta.metrics || activeType.value?.metrics || []).filter((key) => metrics[key]))
watch(dirty, () => { detailRow.value = null })
watch([search, pageSize], () => { page.value = 1 })
const filename = computed(() => `network-mapping-${result.value?.meta.data_type}-${filters.value.start_date}-${filters.value.end_date}`)

watch(() => filters.value.data_type, () => {
  const groups = selectedType.value?.groups || []
  if (!groups.includes(filters.value.group_by)) filters.value.group_by = groups[0] || 'day'
})
watch(charts, (choices) => { if (!choices.includes(display.value.chart)) display.value.chart = choices[0] || 'bar' })
watch(() => timeSettings.timezone, () => {
  controller?.abort()
  loading.value = false
  result.value = null
  overviewApplied.value = ''
  overviewKey.value++
  error.value = '系统时区已更新，请重新生成统计。'
})

function setRange() {
  if (filters.value.range === 'custom') return
  filters.value.end_date = calendarDate()
  filters.value.start_date = addCalendarDays(filters.value.end_date, 1 - Number(filters.value.range))
}
function sortBy(key) {
  sort.value = { key, direction: sort.value.key === key ? -sort.value.direction : 1 }
  page.value = 1
}

async function initialize() {
  setupController?.abort()
  const request = new AbortController()
  setupController = request
  initializing.value = true
  error.value = ''
  const [catalog, scannerList] = await Promise.allSettled([
    http.get('/api/analysis/statistics/catalog', { signal: request.signal }),
    http.get('/api/scanner/list', { signal: request.signal }),
  ])
  if (disposed || request.signal.aborted) return
  if (scannerList.status === 'fulfilled' && scannerList.value.data?.success && Array.isArray(scannerList.value.data.data)) {
    scanners.value = scannerList.value.data.data.map((s) => ({ id: s.scanner_id, name: s.name || s.scanner_id })).filter((s) => s.id)
    scannerError.value = ''
  } else scannerError.value = '扫描器列表加载失败，仍可查询全部扫描器。'
  if (catalog.status === 'fulfilled' && catalog.value.data?.success && Array.isArray(catalog.value.data.data?.types)) {
    types.value = catalog.value.data.data.types
    initializing.value = false
    await generate()
  } else {
    error.value = catalog.reason?.response?.data?.message || '统计配置加载失败，请重试。'
    initializing.value = false
  }
}

function openSpecialty(kind) {
  overview.value = false
  filters.value = { ...overviewFilters.value, data_type: kind, group_by: types.value.find((type) => type.id === kind).groups[0] }
  generate()
}
async function generate() {
  if (overview.value) {
    try { queryBody(filters.value, timeSettings.timezone) } catch (e) { error.value = e.message; return }
    overviewFilters.value = { ...filters.value }
    overviewApplied.value = fingerprint.value
    overviewKey.value++
    error.value = ''
    return
  }
  if (!selectedType.value) return
  let body
  try { body = queryBody(filters.value, timeSettings.timezone) } catch (e) { error.value = e.message; return }
  body.metrics = selectedType.value.metrics.filter((key) => filters.value.percentiles || !['p50_ms', 'p95_ms'].includes(key))
  controller?.abort()
  const request = new AbortController()
  controller = request
  const appliedFingerprint = fingerprint.value
  loading.value = true
  error.value = ''
  exportError.value = ''
  try {
    const response = await http.post('/api/analysis/statistics/query', body, { signal: request.signal })
    if (disposed || request.signal.aborted) return
    const data = response.data
    if (!data?.success || !Array.isArray(data.data?.rows) || !data.meta || !data.data?.summary) throw new Error('服务器未返回有效的统计结果。')
    detailRow.value = null
    result.value = enrichStatistics(data)
    applied.value = appliedFingerprint
    const definition = types.value.find((t) => t.id === data.meta.data_type)
    const metric = definition.metrics[0]
    display.value = { ...display.value, metric, chart: availableCharts(definition, data.meta.group_by, metric)[0], title: `${definition.label}统计` }
    sort.value = { key: 'label', direction: 1 }
    page.value = 1
    search.value = ''
  } catch (e) {
    if (disposed || request.signal.aborted) return
    error.value = e.response?.data?.message || e.message || '统计生成失败，请重试。'
  } finally {
    if (!disposed && !request.signal.aborted) loading.value = false
  }
}

function reset() {
  filters.value = defaultFilters()
  generate()
}

function exportData(format, scope = 'full') {
  if (!canExport.value) return
  exportError.value = ''
  const rows = scope === 'chart' ? plottedRows.value : result.value.data.rows
  const metricKeys = scope === 'chart' ? (display.value.chart === 'stacked' ? ['succeeded', 'failed', 'partial', 'cancelled'] : [display.value.metric]) : visibleMetrics.value
  if (format === 'json') {
    const data = { ...result.value, export: { scope, title: title.value, metric_keys: metricKeys }, data: { ...result.value.data, rows } }
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), `${filename.value}-${scope}.json`)
  } else {
    downloadBlob(new Blob([statisticsCsv(result.value, activeType.value, rows, metricKeys)], { type: 'text/csv;charset=utf-8' }), `${filename.value}-${scope}.csv`)
  }
}

async function exportImage() {
  if (!canExport.value || !chartRef.value) return
  exporting.value = true
  exportError.value = ''
  try { await chartRef.value.exportImage({ ...image.value, filename: filename.value }) } catch (e) {
    if (!disposed) exportError.value = e.message || '图片导出失败，请重试。'
  } finally { if (!disposed) exporting.value = false }
}

onMounted(initialize)
onBeforeUnmount(() => { disposed = true; controller?.abort(); setupController?.abort() })
</script>

<template>
  <main class="page-shell">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><h1 class="page-title">统计分析</h1><p class="mt-1 text-sm text-base-content/60">选择数据与汇总方式，生成图表并导出图片或数据。</p></div>
      <span v-if="result" class="text-xs text-base-content/50">生成于 {{ formatDateTime(result.meta.generated_at, result.meta.timezone) }}</span>
    </div>
    <AppAlert v-if="error" type="error" title="统计未能生成" :description="error" :timeout="0" :closable="false" class="mb-4" />
    <AppAlert v-if="scannerError" type="warning" title="扫描器筛选暂时不可用" :description="scannerError" :timeout="0" :closable="false" class="mb-4" />
    <div v-if="initializing" class="skeleton h-48 w-full"></div>
    <div v-else-if="!types.length" class="card border border-base-300 bg-base-100 p-5"><button class="btn btn-sm btn-neutral self-start" @click="initialize">重新加载统计配置</button></div>
    <template v-else>
      <section class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body gap-4 p-4">
          <div class="flex flex-wrap gap-2" aria-label="统计模板">
            <button class="btn btn-sm" :class="overview ? 'btn-neutral' : 'btn-ghost'" :disabled="loading || exporting" @click="overview = true; generate()">总览</button>
            <button v-for="type in types" :key="type.id" class="btn btn-sm" :class="!overview && filters.data_type === type.id ? 'btn-neutral' : 'btn-ghost'" :disabled="loading || exporting" @click="overview = false; filters.data_type = type.id">{{ type.label }}</button>
          </div>
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <fieldset v-if="!overview" class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-1`">汇总方式</label></legend><select :id="`${formFieldId}-1`" v-model="filters.group_by" class="select select-bordered w-full" :disabled="loading || exporting"><option v-for="group in selectedType.groups" :key="group" :value="group">{{ groupLabels[group] }}</option></select></fieldset>
            <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-2`">时间范围</label></legend><select :id="`${formFieldId}-2`" v-model="filters.range" class="select select-bordered w-full" :disabled="loading || exporting" @change="setRange"><option value="7">最近 7 天</option><option value="30">最近 30 天</option><option value="90">最近 90 天</option><option value="custom">自定义</option></select></fieldset>
            <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-3`">开始日期 · {{ timeSettings.timezone }}</label></legend><input :id="`${formFieldId}-3`" v-model="filters.start_date" type="date" :max="filters.end_date" class="input input-bordered w-full" :disabled="loading || exporting" @change="filters.range = 'custom'" /></fieldset>
            <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-4`">结束日期（含当天）</label></legend><input :id="`${formFieldId}-4`" v-model="filters.end_date" type="date" :min="filters.start_date" :max="calendarDate()" class="input input-bordered w-full" :disabled="loading || exporting" @change="filters.range = 'custom'" /></fieldset>
            <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-5`">扫描器</label></legend><select :id="`${formFieldId}-5`" v-model="filters.scanner_id" class="select select-bordered w-full" :disabled="loading || exporting"><option value="">全部扫描器</option><option v-for="scanner in scanners" :key="scanner.id" :value="scanner.id">{{ scanner.name }}</option></select></fieldset>
            <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-6`">任务来源</label></legend><select :id="`${formFieldId}-6`" v-model="filters.task_source" class="select select-bordered w-full" :disabled="loading || exporting"><option value="">全部来源</option><option value="manual">手动任务</option><option value="automatic">自动任务</option><option value="search">搜索生成</option></select></fieldset>
          </div>
          <div v-if="!overview" class="flex flex-wrap gap-4 text-sm"><label class="flex items-center gap-2"><input v-model="filters.comparison" type="checkbox" class="checkbox checkbox-sm" :disabled="loading || exporting" />对比前一等长周期</label><label v-if="filters.data_type === 'scanners'" class="flex items-center gap-2"><input v-model="filters.percentiles" type="checkbox" class="checkbox checkbox-sm" :disabled="loading || exporting" />计算 P50 / P95 耗时</label></div>
          <div class="flex flex-wrap items-center justify-between gap-3"><p class="text-xs text-base-content/50">最多查询 366 天；图表、表格与导出使用同一次统计结果。</p><div class="flex gap-2"><button class="btn btn-sm btn-ghost" :disabled="loading || exporting" @click="reset">重置</button><button class="btn btn-sm btn-neutral" :disabled="loading || exporting" @click="generate"><span v-if="loading" class="loading loading-spinner loading-xs"></span>{{ loading ? '统计中…' : '生成统计' }}</button></div></div>
        </div>
      </section>
      <AppAlert v-if="dirty" type="warning" title="条件已修改，待重新生成" description="下方仍展示上一次生成的结果，请生成统计后再导出。" :timeout="0" :closable="false" class="mt-4" />
      <div v-if="loading && !result" class="mt-5 skeleton h-96 w-full"></div>
      <StatisticsOverview v-if="overview && types.length" :key="overviewKey" :filters="overviewFilters" :types="types" @open="openSpecialty" />
      <template v-if="result && !overview">
        <p v-if="result.meta.period_complete === false" class="mt-4 text-xs text-warning">本期包含尚未结束的日期，数据仍在变化；与完整上期比较时请注意统计时长。</p>
        <div class="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div v-for="key in summaryKeys" :key="key" class="card border border-base-300 bg-base-100 p-4"><p class="text-xs text-base-content/60">{{ metrics[key].label }}</p><p class="mt-2 text-2xl font-semibold">{{ formatMetric(result.data.summary[key], key) }} <span class="text-xs font-normal text-base-content/50">{{ metrics[key].unit }}</span></p></div>
        </div>
        <section v-if="result.comparison" class="mt-5 card border border-base-300 bg-base-100 p-4">
          <h2 class="font-semibold">上期对比</h2><p class="mt-1 text-xs opacity-60">{{ imageCaption(result.comparison.meta) }} · {{ result.comparison.note }}</p>
          <div class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>指标</th><th>本期</th><th>上期</th><th>绝对变化</th></tr></thead><tbody><tr v-for="key in summaryKeys" :key="key"><td>{{ metrics[key].label }}</td><td>{{ formatMetric(result.data.summary[key], key) }}</td><td>{{ formatMetric(result.comparison.data.summary[key], key) }}</td><td>{{ metricDifference(result.data.summary[key], result.comparison.data.summary[key], key) }}</td></tr></tbody></table></div>
        </section>
        <section class="mt-5 card border border-base-300 bg-base-100 shadow-sm">
          <div class="card-body p-4">
            <div><h2 class="font-semibold">{{ title }}</h2><p class="mt-1 text-xs text-base-content/60">{{ imageCaption(result.meta) }}</p></div>
            <div class="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-7`">统计指标</label></legend><select :id="`${formFieldId}-7`" v-model="display.metric" class="select select-bordered select-sm w-full" :disabled="exporting"><option v-for="key in visibleMetrics" :key="key" :value="key">{{ metrics[key].label }}（{{ metrics[key].unit }}）</option></select></fieldset>
              <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-8`">图表类型</label></legend><select :id="`${formFieldId}-8`" v-model="display.chart" class="select select-bordered select-sm w-full" :disabled="exporting"><option v-for="type in charts" :key="type" :value="type">{{ chartLabels[type] }}</option></select></fieldset>
              <fieldset v-if="!['day', 'week', 'month'].includes(result.meta.group_by)" class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-9`">展示数量</label></legend><select :id="`${formFieldId}-9`" v-model.number="display.top" class="select select-bordered select-sm w-full" :disabled="exporting"><option :value="5">Top 5</option><option :value="10">Top 10</option><option :value="20">Top 20</option></select></fieldset>
              <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-10`">图表标题</label></legend><input :id="`${formFieldId}-10`" v-model="display.title" maxlength="80" class="input input-bordered input-sm w-full" :disabled="exporting" /></fieldset>
            </div>
            <p v-if="!['day', 'week', 'month'].includes(result.meta.group_by)" class="mt-1 text-xs text-base-content/50">按当前指标从高到低展示；{{ ['port', 'service'].includes(result.meta.data_type) ? '剩余类别合并为“其他”。' : '完整汇总保留所有分组。' }}</p>
            <div v-if="hasData" class="min-w-0"><StatisticsChart ref="chartRef" :rows="plottedRows" :meta="result.meta" :metric="display.metric" :type="display.chart" :title="title" @select="(row) => { if (!dirty && !loading && row.label !== '其他') detailRow = row }" /></div>
            <EmptyState v-else title="当前范围内没有统计数据" message="可以扩大时间范围或调整扫描器、任务来源条件。" class="mt-3" />
            <div class="flex flex-wrap items-end gap-3 border-t border-base-300 pt-4">
              <fieldset class="fieldset min-w-0 w-full sm:w-auto"><legend class="fieldset-legend"><label :for="`${formFieldId}-11`">图片格式</label></legend><select :id="`${formFieldId}-11`" v-model="image.format" class="select select-bordered select-sm w-full" :disabled="exporting"><option value="png">PNG 高清</option><option value="svg">SVG</option></select></fieldset>
              <fieldset class="fieldset min-w-0 w-full sm:w-auto"><legend class="fieldset-legend"><label :for="`${formFieldId}-12`">图片宽度</label></legend><select :id="`${formFieldId}-12`" v-model.number="image.width" class="select select-bordered select-sm w-full" :disabled="exporting"><option :value="960">960 px</option><option :value="1400">1400 px</option><option :value="1920">1920 px</option></select></fieldset>
              <fieldset class="fieldset min-w-0 w-full sm:w-auto"><legend class="fieldset-legend"><label :for="`${formFieldId}-13`">背景</label></legend><select :id="`${formFieldId}-13`" v-model="image.background" class="select select-bordered select-sm w-full" :disabled="exporting"><option value="white">白色</option><option value="transparent">透明</option></select></fieldset>
              <button class="btn btn-sm btn-neutral" :disabled="!canExport" @click="exportImage"><span v-if="exporting" class="loading loading-spinner loading-xs"></span>{{ exporting ? '生成图片中…' : '导出图片' }}</button>
              <button class="btn btn-sm" :disabled="!canExport" @click="exportData('csv', 'chart')">导出图表数据 CSV</button>
              <span class="text-xs text-base-content/50">PNG 按所选宽度的 2 倍像素导出。</span>
            </div>
            <AppAlert v-if="exportError" type="error" title="导出失败" :description="exportError" :timeout="0" :closable="false" class="mt-3" />
          </div>
        </section>
        <section class="mt-5 card border border-base-300 bg-base-100 shadow-sm">
          <div class="card-body p-4">
            <div class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="font-semibold">完整汇总数据</h2><p class="mt-1 text-xs text-base-content/60">共 {{ result.data.rows.length }} 个分组；导出包含所有分组，不受 Top N 和分页影响。</p></div><div class="flex gap-2"><button class="btn btn-sm" :disabled="!canExport" @click="exportData('csv')">导出 CSV</button><button class="btn btn-sm" :disabled="!canExport" @click="exportData('json')">导出 JSON</button></div></div>
            <div class="flex flex-wrap items-center gap-3"><input v-model="search" class="input input-bordered input-sm" placeholder="搜索分组名称" aria-label="搜索分组名称" /><label class="flex items-center gap-2 text-xs">每页<select v-model.number="pageSize" class="select select-bordered select-sm"><option :value="20">20 条</option><option :value="50">50 条</option><option :value="100">100 条</option></select></label><span class="text-xs opacity-60">筛选后 {{ sortedRows.length }} 组；完整导出仍包含全部分组</span></div>
            <div class="overflow-x-auto"><table class="table table-sm"><thead><tr><th><button class="whitespace-nowrap" @click="sortBy('label')">{{ groupLabels[result.meta.group_by] }} {{ sort.key === 'label' ? (sort.direction === 1 ? '↑' : '↓') : '↕' }}</button></th><th v-for="key in visibleMetrics" :key="key"><button class="whitespace-nowrap" @click="sortBy(key)">{{ metrics[key].label }}（{{ metrics[key].unit }}） {{ sort.key === key ? (sort.direction === 1 ? '↑' : '↓') : '↕' }}</button></th></tr></thead><tbody><tr v-for="row in pagedRows" :key="row.label"><td class="max-w-80 break-words"><button class="link link-hover text-left" :disabled="dirty || loading" @click="detailRow = row">{{ rowLabel(row.label, result.meta.group_by) }}</button></td><td v-for="key in visibleMetrics" :key="key">{{ formatMetric(row[key], key) }}</td></tr><tr v-if="!pagedRows.length"><td :colspan="visibleMetrics.length + 1" class="py-6 text-center opacity-60">暂无汇总数据</td></tr></tbody></table></div>
            <div class="flex items-center justify-end gap-3"><span class="text-xs opacity-60">{{ page }} / {{ pages }}</span><button class="btn btn-sm" :disabled="page <= 1" @click="page--">上一页</button><button class="btn btn-sm" :disabled="page >= pages" @click="page++">下一页</button></div>
          </div>
        </section>
        <StatisticsDetails v-if="detailRow" :key="`${result.meta.generated_at}-${detailRow.label}`" :result="result" :row="detailRow" @close="detailRow = null" />
        <section class="mt-5 card border border-base-300 bg-base-100 p-4"><h2 class="font-semibold">统计口径与数据状态</h2><p class="mt-2 text-xs text-base-content/60">{{ result.meta.mode === 'snapshot' ? '分析快照' : result.meta.mode === 'realtime' ? '实时索引' : '任务历史' }}<span v-if="result.meta.data_as_of"> · 处理水位 {{ formatDateTime(result.meta.data_as_of, result.meta.timezone) }}</span> · 基于保留数据</p><p v-for="note in result.meta.notes" :key="note" class="mt-2 text-xs text-base-content/60">{{ note }}</p></section>
      </template>
    </template>
  </main>
</template>
