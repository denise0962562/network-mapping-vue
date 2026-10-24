<script setup>
import { tr } from '../i18n/index.js'

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import http from '@/utils/http'
import { addCalendarDays, calendarMidnight, formatDateTime } from '../i18n/time.js'
import { downloadBlob } from '@/utils/statistics'
import { chartCsv } from '@/utils/chartCsv'

const props = defineProps({ result: { type: Object, required: true }, row: { type: Object, required: true } })
defineEmits(['close'])
const rows = ref([]), cursor = ref(null), loading = ref(false), error = ref(''), note = ref('')
const page = ref(1), cursors = [null]
let controller, disposed = false
const columns = computed(() => props.result.meta.data_type === 'tasks' ? ['task_id', 'status', 'created_at', 'ended_at', 'created_in_period', 'completed_in_period'] : props.result.meta.data_type === 'scanners' ? ['task_id', 'execution_id', 'scanner_id', 'status', 'started_at', 'ended_at'] : ['ip_address', 'port', 'service', 'category', 'count', 'observed_at', 'scanner_id', 'execution_id', 'task_id'])
const labels = { get task_id() { return tr("任务") }, get execution_id() { return tr("执行") }, get scanner_id() { return tr("扫描器") }, get status() { return tr("状态") }, get created_at() { return tr("创建时间") }, get ended_at() { return tr("结束时间") }, get started_at() { return tr("开始时间") }, ip_address: 'IP', get port() { return tr("端口") }, get service() { return tr("服务") }, get category() { return tr("类别") }, get count() { return tr("端点观测数") }, get observed_at() { return tr("观测时间") }, get created_in_period() { return tr("本期创建") }, get completed_in_period() { return tr("本期完成") } }
const statuses = { get succeeded() { return tr("成功") }, get failed() { return tr("失败") }, get partial() { return tr("部分完成") }, get cancelled() { return tr("取消") }, get pending() { return tr("待执行") }, get running() { return tr("执行中") } }
function value(row, key) {
  if (row[key] == null) return '--'
  if (key.endsWith('_at')) return formatDateTime(row[key], props.result.meta.timezone)
  if (typeof row[key] === 'boolean') return row[key] ? tr("是") : tr("否")
  return key === 'status' ? (statuses[row[key]] || row[key]) : row[key]
}
function taskLink(id) { return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) }
function requestBody(after) {
  const meta = props.result.meta
  const body = { mode: meta.mode, data_type: meta.data_type, timezone: meta.timezone, start_at: meta.start_at, end_at: meta.end_at, page_size: 50, ...(meta.scanner_id ? { scanner_id: meta.scanner_id } : {}), ...(meta.task_source ? { task_source: meta.task_source } : {}), ...(after != null ? { after } : {}) }
  if (['day', 'week', 'month'].includes(meta.group_by)) {
    const start = props.row.label
    const next = meta.group_by === 'month' ? addCalendarDays(start, new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0)).getUTCDate()) : addCalendarDays(start, meta.group_by === 'week' ? 7 : 1)
    body.start_at = new Date(Math.max(Date.parse(meta.start_at), Date.parse(calendarMidnight(start)))).toISOString()
    body.end_at = new Date(Math.min(Date.parse(meta.end_at), Date.parse(calendarMidnight(next)))).toISOString()
  } else if (meta.group_by === 'scanner') {
    const id = props.row.label.match(/\[([^\]]+)\]$/)?.[1] || props.row.label
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(tr("此分组没有可用的扫描器标识"))
    body.scanner_id = id
  } else if (meta.group_by === 'task_source') body.task_source = props.row.label
  else body.category = props.row.label
  return body
}
async function load(target) {
  if (loading.value) return
  loading.value = true; error.value = ''
  controller = new AbortController()
  try {
    const response = await http.post('/api/analysis/statistics/details', requestBody(cursors[target - 1]), { signal: controller.signal })
    if (disposed) return
    rows.value = response.data.data.rows; cursor.value = response.data.data.next_cursor; note.value = response.data.meta.note; page.value = target
  } catch (e) { if (!disposed) error.value = e.response?.data?.message || e.message || tr("明细加载失败") }
  finally { if (!disposed) loading.value = false }
}
function next() { cursors[page.value] = cursor.value; load(page.value + 1) }
function exportPage() {
  const csv = chartCsv({ headers: columns.value.map((key) => labels[key]), rows: rows.value.map((row) => columns.value.map((key) => value(row, key))) })
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `statistics-details-${page.value}.csv`)
}
onMounted(() => load(1))
onBeforeUnmount(() => { disposed = true; controller?.abort() })
</script>

<template>
  <section class="mt-5 card border border-base-300 bg-base-100 p-4" :aria-label="tr(&quot;统计明细&quot;)">
    <div class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="font-semibold">{{ row.label }} {{ tr("· 统计明细") }}</h2><p class="mt-1 text-xs opacity-60">{{ tr("每页最多 50 条，按需加载。") }}</p></div><div class="flex gap-2"><button class="btn btn-sm" :disabled="loading || !!error || !rows.length" @click="exportPage">{{ tr("导出当前页") }}</button><button class="btn btn-sm btn-ghost" @click="$emit('close')">{{ tr("关闭明细") }}</button></div></div>
    <p v-if="note" class="mt-3 text-xs opacity-60">{{ note }}</p>
    <p v-if="error" role="alert" class="mt-3 text-sm text-error">{{ error }} <button class="btn btn-xs btn-ghost" @click="load(page)">{{ tr("重试") }}</button></p>
    <div v-if="loading" class="mt-3 skeleton h-32"></div>
    <div v-else-if="!error" class="mt-3 overflow-x-auto"><table class="table table-sm"><thead><tr><th v-for="key in columns" :key="key">{{ labels[key] }}</th></tr></thead><tbody><tr v-for="(item, index) in rows" :key="index"><td v-for="key in columns" :key="key" class="max-w-64 break-words"><RouterLink v-if="key === 'task_id' && taskLink(item[key])" class="link link-hover" :to="`/task/${item[key]}`">{{ item[key] }}</RouterLink><span v-else>{{ value(item, key) }}</span></td></tr><tr v-if="!rows.length"><td :colspan="columns.length" class="py-6 text-center opacity-60">{{ tr("暂无保留明细；历史清理或索引更新可能影响可见记录。") }}</td></tr></tbody></table></div>
    <div class="mt-3 flex items-center justify-end gap-3"><span class="text-xs opacity-60">{{ tr("第") }} {{ page }} {{ tr("页") }}</span><button class="btn btn-sm" :disabled="loading || page <= 1" @click="load(page - 1)">{{ tr("上一页明细") }}</button><button class="btn btn-sm" :disabled="loading || !!error || cursor == null" @click="next">{{ tr("下一页明细") }}</button></div>
  </section>
</template>
