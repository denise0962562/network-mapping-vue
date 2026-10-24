<script setup>
import { tr } from '../i18n/index.js'

import { computed, onBeforeUnmount, ref, watch, useId } from 'vue'
import http from '@/utils/http'
import { formatDateTime } from '../i18n/time.js'

const formFieldId = useId()
const props = defineProps({ scanner: { type: Object, required: true } })
const jobs = ref([])
const sources = ref([])
const files = ref([])
const errors = ref([])
const incidents = ref([])
const selected = ref([])
const page = ref(1)
const hasMore = ref(false)
const level = ref('')
const errorCode = ref('')
const loading = ref(false)
const busy = ref(false)
const failed = ref(false)
const forbidden = ref(false)
const message = ref('')
const expanded = ref(null)
const downloading = ref(null)
const supported = computed(() => props.scanner.diagnostics_capabilities?.supported_versions?.includes(1))
const acceptingTasks = computed(() => props.scanner.accepting_tasks !== false)
const pending = computed(() => jobs.value.some((job) => ['queued', 'accepted', 'uploading'].includes(job.status)))
const statusLabels = { get queued() { return tr("等待扫描器连接") }, get accepted() { return tr("已接收") }, get uploading() { return tr("上传中") }, get ready() { return tr("已完成") }, get failed() { return tr("失败") }, get expired() { return tr("已过期") }, get cancelled() { return tr("已取消") } }
const categories = { get scan_engine() { return tr("扫描引擎") }, get communication() { return tr("服务端通信") }, get authentication() { return tr("身份凭据") }, get configuration() { return tr("配置") }, get storage() { return tr("本地存储") }, get lease() { return tr("任务租约") }, get partial_result() { return tr("部分结果") }, get process() { return tr("进程") }, get unknown() { return tr("未分类") } }
let timer
let generation = 0
let activeRequest = false
let requestSequence = 0
let controller

function size(bytes) {
  const value = Number(bytes || 0)
  return value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1024 / 1024).toFixed(1)} MiB`
}

function reset() {
  generation += 1
  controller?.abort()
  jobs.value = []; sources.value = []; files.value = []; errors.value = []; incidents.value = []
  selected.value = []; page.value = 1; hasMore.value = false; expanded.value = null
  forbidden.value = false; failed.value = false; message.value = ''
  activeRequest = false
}

async function load({ silent = false } = {}) {
  if (!props.scanner.scanner_id || forbidden.value || (silent && activeRequest)) return
  controller?.abort()
  controller = new AbortController()
  const options = { signal: controller.signal, timeout: 15000 }
  const sequence = ++requestSequence
  const current = generation
  const scannerId = props.scanner.scanner_id
  activeRequest = true
  if (!silent) loading.value = true
  try {
    const base = `/api/scanner/${scannerId}`
    const responses = await Promise.all([
      http.get(`${base}/diagnostic-jobs`, options),
      http.get(`${base}/log-files`, options),
      http.get(`${base}/errors`, { ...options, params: { page: page.value, level: level.value || undefined, error_code: errorCode.value.trim() || undefined } }),
      http.get(`${base}/incidents`, options)
    ])
    if (current !== generation || sequence !== requestSequence) return
    if (responses.some((response) => response.data?.success !== true)) throw new Error(tr("诊断数据无效"))
    jobs.value = responses[0].data.data || []
    sources.value = responses[1].data.data?.sources || []
    files.value = responses[1].data.data?.files || []
    errors.value = responses[2].data.data || []
    hasMore.value = responses[2].data.has_more === true
    incidents.value = responses[3].data.data || []
    selected.value = selected.value.filter((id) => sources.value.some((source) => source.source_file_id === id))
    failed.value = false
  } catch (error) {
    if (current !== generation || sequence !== requestSequence) return
    forbidden.value = error?.response?.status === 403
    failed.value = !forbidden.value
  } finally {
    if (current === generation && sequence === requestSequence) { activeRequest = false; loading.value = false }
  }
}

async function createJob(type) {
  if (busy.value || !supported.value) return
  const current = generation
  busy.value = true
  message.value = ''
  try {
    await http.post(`/api/scanner/${props.scanner.scanner_id}/diagnostic-jobs`, {
      type,
      source_file_ids: type === 'collect_logs' ? selected.value : []
    })
    if (current !== generation) return
    message.value = props.scanner.is_online ? tr("采集请求已创建，等待扫描器处理") : tr("请求已排队，扫描器重新连接后将开始处理")
    await load({ silent: true })
  } catch (error) {
    if (current !== generation) return
    message.value = error?.response?.status === 409 ? tr("扫描器暂不支持诊断，或目录清单已经失效，请刷新后重试") : error?.response?.status === 429 ? tr("待处理请求较多，请稍后重试") : tr("创建采集请求失败，请稍后重试")
  } finally { if (current === generation) busy.value = false }
}

async function acknowledge(incident) {
  const current = generation
  try {
    await http.post(`/api/scanner/${props.scanner.scanner_id}/incidents/${incident.fingerprint}/ack`)
    if (current === generation) await load({ silent: true })
  } catch { if (current === generation) message.value = tr("确认告警失败，请稍后重试") }
}

async function download(file) {
  const current = generation
  downloading.value = file.file_id
  try {
    const response = await http.get(`/api/scanner/${props.scanner.scanner_id}/log-files/${file.file_id}/download`, { responseType: 'blob' })
    if (current !== generation) return
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = file.snapshot.source.name
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch { if (current === generation) message.value = tr("下载失败，日志可能已过期或权限发生变化") }
  finally { if (current === generation) downloading.value = null }
}

function evidenceFile(id) { return files.value.find((file) => file.file_id === id && file.ready) }

function filterErrors() { page.value = 1; load() }
function changePage(change) { page.value = Math.max(1, page.value + change); expanded.value = null; load() }

watch(() => props.scanner.scanner_id, () => {
  reset()
  busy.value = false; downloading.value = null
  window.clearInterval(timer)
  load()
  timer = window.setInterval(() => load({ silent: true }), 5000)
}, { immediate: true })

onBeforeUnmount(() => { generation += 1; controller?.abort(); window.clearInterval(timer) })
</script>

<template>
  <section class="card bg-base-100 card-border border-base-300 p-4 space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="font-semibold">{{ tr("错误与日志") }}</h3>
      <button class="btn btn-ghost btn-sm" :disabled="loading || forbidden" @click="load()">{{ tr("刷新") }}</button>
    </div>

    <p v-if="forbidden" class="text-sm opacity-70">{{ tr("仅管理员可以查看错误详情和下载日志。") }}</p>
    <template v-else>
      <div v-if="!acceptingTasks" role="alert" class="alert alert-error"><span>{{ tr("扫描器报告健康异常，已停止领取任务。可查看错误并尝试采集日志，修复后请重启扫描器。") }}</span></div>
      <div v-else class="flex flex-wrap items-center gap-2 text-sm">
        <span class="badge badge-sm" :class="scanner.is_online ? 'badge-success' : 'badge-ghost'">{{ scanner.is_online ? tr("在线") : tr("离线") }}</span>
        <span>{{ scanner.is_online ? tr("诊断数据随扫描器上报更新") : tr("展示已保存的诊断；新的采集请求等待重新连接") }}</span>
      </div>
      <div v-if="scanner.diagnostic_dropped_events > 0" role="alert" class="alert alert-warning"><span>{{ tr("本次运行有") }} {{ scanner.diagnostic_dropped_events }} {{ tr("条诊断事件未能保存在上报队列中，可采集原始日志补充排查。") }}</span></div>
      <div v-if="message" role="alert" class="alert alert-info"><span>{{ message }}</span></div>
      <div v-if="failed" role="alert" class="alert alert-error"><span>{{ tr("诊断数据加载失败，请刷新重试。") }}</span></div>
      <div v-if="loading" class="flex justify-center py-4"><span class="loading loading-spinner loading-sm"></span></div>

      <div v-if="incidents.length" class="space-y-2">
        <h4 class="font-medium text-sm">{{ tr("近期告警") }}</h4>
        <div v-for="incident in incidents.slice(0, 5)" :key="incident.fingerprint" class="rounded-lg bg-base-200/60 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="break-all font-medium">{{ incident.error_code }} <span class="badge badge-sm" :class="incident.recovered_at ? 'badge-success' : incident.acknowledged_at ? 'badge-ghost' : 'badge-warning'">{{ incident.recovered_at ? tr("已恢复") : incident.acknowledged_at ? tr("已确认") : tr("待处理") }}</span></div>
            <div class="opacity-70 mt-1">{{ tr("发生") }} {{ incident.occurrences }} {{ tr("次 · 最近") }} {{ formatDateTime(incident.last_seen_at) }}</div>
          </div>
          <button v-if="!incident.acknowledged_at && !incident.recovered_at" class="btn btn-ghost btn-xs" @click="acknowledge(incident)">{{ tr("确认告警") }}</button>
        </div>
      </div>

      <div class="space-y-2">
        <h4 class="font-medium text-sm">{{ tr("错误记录") }}</h4>
        <form class="flex flex-wrap items-end gap-2" @submit.prevent="filterErrors">
          <fieldset class="fieldset min-w-0 w-full sm:w-auto"><legend class="fieldset-legend"><label :for="`${formFieldId}-1`" class="opacity-70">{{ tr("级别") }}</label></legend><select :id="`${formFieldId}-1`" v-model="level" class="select select-bordered select-sm w-full"><option value="">{{ tr("全部") }}</option><option value="ERROR">{{ tr("错误") }}</option><option value="WARN">{{ tr("警告") }}</option></select></fieldset>
          <fieldset class="fieldset min-w-0 w-full sm:w-auto flex-1 min-w-40"><legend class="fieldset-legend"><label :for="`${formFieldId}-2`" class="opacity-70">{{ tr("错误码") }}</label></legend><input :id="`${formFieldId}-2`" v-model="errorCode" maxlength="128" class="input input-bordered input-sm w-full" :placeholder="tr(&quot;按错误码筛选&quot;)" /></fieldset>
          <button class="btn btn-sm" :disabled="loading" type="submit">{{ tr("查询") }}</button>
        </form>
        <p v-if="!errors.length && !loading && !failed" class="rounded-lg bg-base-200/60 p-3 text-sm opacity-70">{{ tr("暂无已上报错误。") }}</p>
        <div v-for="record in errors" :key="record.event_id" class="rounded-lg bg-base-200/60 p-3 text-sm">
          <button class="w-full text-left" :aria-expanded="expanded === record.event_id" @click="expanded = expanded === record.event_id ? null : record.event_id">
            <div class="flex flex-wrap items-center gap-2"><span class="badge badge-sm" :class="record.level === 'ERROR' ? 'badge-error' : 'badge-warning'">{{ record.level }}</span><span class="font-medium break-all">{{ record.document.error_code }}</span><span class="opacity-70">{{ categories[record.document.category] || tr("未分类") }}</span></div>
            <div class="mt-1 opacity-70">{{ formatDateTime(record.occurred_at) }}<span v-if="record.document.classification_source === 'legacy_rule'"> {{ tr("· 旧日志规则识别") }}</span></div>
            <p class="mt-1 break-words">{{ record.document.message || tr("无错误说明") }}</p>
          </button>
          <div v-if="expanded === record.event_id" class="mt-3 space-y-2 border-t border-base-300 pt-3">
            <p>{{ tr("操作：") }}{{ record.document.operation || '-' }} {{ tr("· 引擎：") }}{{ record.document.engine || '-' }} {{ tr("· 阶段：") }}{{ record.document.stage || '-' }}</p>
            <p>{{ tr("接收时间：") }}{{ formatDateTime(record.received_at) }}</p>
            <router-link v-if="record.document.task_id" class="link link-neutral" :to="`/task/${record.document.task_id}`">{{ tr("查看关联任务") }}</router-link>
            <pre class="overflow-x-auto text-xs whitespace-pre-wrap break-all">{{ JSON.stringify(record.document.details, null, 2) }}</pre>
            <p v-for="evidence in record.evidence || []" :key="`${evidence.file_id}-${evidence.byte_offset}`" class="text-xs opacity-70">{{ tr("日志证据：") }}{{ evidence.file_id }} {{ tr("· 第") }} {{ evidence.line_number }} {{ tr("行") }} <button v-if="evidenceFile(evidence.file_id)" class="link link-neutral" :disabled="downloading === evidence.file_id" @click="download(evidenceFile(evidence.file_id))">{{ tr("下载证据日志") }}</button></p>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2"><button class="btn btn-ghost btn-xs" :disabled="page <= 1 || loading" @click="changePage(-1)">{{ tr("上一页") }}</button><span class="text-xs">{{ tr("第") }} {{ page }} {{ tr("页") }}</span><button class="btn btn-ghost btn-xs" :disabled="!hasMore || loading" @click="changePage(1)">{{ tr("下一页") }}</button></div>
      </div>

      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2"><h4 class="font-medium text-sm">{{ tr("扫描端日志目录") }}</h4><button class="btn btn-sm btn-ghost" :disabled="busy || !supported || pending" @click="createJob('list_logs')">{{ tr("刷新目录") }}</button></div>
        <p v-if="!supported" class="text-sm opacity-70">{{ tr("该扫描器尚未声明远程诊断能力，请升级并等待首次心跳。已保存日志仍可下载。") }}</p>
        <p v-else-if="!sources.length" class="text-sm opacity-70">{{ tr("暂无目录清单，请先刷新目录。") }}</p>
        <div v-if="sources.length" class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>{{ tr("选择") }}</th><th>{{ tr("文件") }}</th><th>{{ tr("大小") }}</th><th>{{ tr("修改时间") }}</th></tr></thead><tbody><tr v-for="source in sources" :key="source.source_file_id"><td><input v-model="selected" type="checkbox" class="checkbox checkbox-sm" :value="source.source_file_id" :disabled="busy || (!selected.includes(source.source_file_id) && selected.length >= 16)" :aria-label="tr(&quot;选择 {0}&quot;, [source.name])" /></td><td class="whitespace-nowrap">{{ source.name }} <span v-if="source.active" class="badge badge-ghost badge-xs">{{ tr("写入中") }}</span></td><td class="whitespace-nowrap">{{ size(source.size_bytes) }}</td><td class="whitespace-nowrap">{{ formatDateTime(source.modified_at) }}</td></tr></tbody></table></div>
        <button v-if="sources.length" class="btn btn-neutral btn-sm" :disabled="busy || !supported || !selected.length || pending" @click="createJob('collect_logs')">{{ tr("采集选中的日志（") }}{{ selected.length }}）</button>
        <p class="text-xs opacity-70">{{ tr("采集保存请求处理时的文件快照；原始日志仅供管理员下载。") }}</p>
      </div>

      <div v-if="jobs.length" class="space-y-2">
        <h4 class="font-medium text-sm">{{ tr("采集进度") }}</h4>
        <div v-for="job in jobs.slice(0, 5)" :key="job.job_id" class="rounded-lg bg-base-200/60 p-3 text-sm flex flex-wrap items-center justify-between gap-2"><span>{{ job.type === 'list_logs' ? tr("目录刷新") : tr("日志采集") }} · {{ formatDateTime(job.created_at) }}<span v-if="job.automatic"> {{ tr("· 自动") }}</span></span><span class="badge badge-sm" :class="job.status === 'ready' ? 'badge-success' : ['failed', 'expired'].includes(job.status) ? 'badge-error' : 'badge-warning'">{{ statusLabels[job.status] || job.status }}</span><span v-if="job.error_code" class="w-full text-xs text-error">{{ job.error_code }}</span></div>
      </div>
      <div class="space-y-2">
        <h4 class="font-medium text-sm">{{ tr("已采集日志") }}</h4>
        <p v-if="!files.length && !loading" class="text-sm opacity-70">{{ tr("暂无已保存日志。") }}</p>
        <div v-for="file in files" :key="file.file_id" class="rounded-lg bg-base-200/60 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0"><p class="break-all font-medium">{{ file.snapshot.source.name }}</p><p class="mt-1 opacity-70">{{ size(file.snapshot.size_bytes) }} {{ tr("· 快照") }} {{ formatDateTime(file.snapshot.captured_at) }} · {{ file.parse_status === 'ready' ? tr("分析完成") : file.parse_status === 'failed' ? tr("分析失败，仍可下载") : tr("等待分析") }}</p><p v-if="file.snapshot.excluded_tail_bytes" class="text-xs opacity-70">{{ tr("末尾") }} {{ file.snapshot.excluded_tail_bytes }} {{ tr("字节尚未形成完整日志行。") }}</p></div>
          <button class="btn btn-sm btn-ghost" :disabled="!file.ready || downloading === file.file_id" @click="download(file)">{{ downloading === file.file_id ? tr("下载中") : file.ready ? tr("下载") : tr("上传中") }}</button>
        </div>
      </div>
    </template>
  </section>
</template>
