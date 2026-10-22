<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppAlert from '@/components/AppAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import ReportTrendChart from '@/components/ReportTrendChart.vue'
import http from '@/utils/http'
import { deliveryStatuses, reportCsv, reportDate, reportTimezone, reportPeriod, reportStatuses } from '@/utils/reports'

const route = useRoute()
const router = useRouter()
const report = ref(null)
const deliveries = ref([])
const recipients = ref([])
const selectedRecipients = ref([])
const loading = ref(true)
const error = ref('')
const forbidden = ref(false)
const actionLoading = ref(false)
const alerts = ref([])
const deliveryError = ref('')
const sendDialog = ref(null)
let controller
let timer
let disposed = false
const payload = computed(() => report.value?.payload)
const cards = computed(() => [
  { title: '新建任务', value: payload.value?.tasks?.created ?? 0 },
  { title: '任务成功率', value: payload.value?.tasks?.success_rate == null ? '--' : `${payload.value.tasks.success_rate}%` },
  { title: '成功执行发现的去重 IP', value: payload.value?.scan_output?.unique_ips ?? 0 },
  { title: '端口 / 服务观测次数', value: `${payload.value?.scan_output?.port_observations ?? 0} / ${payload.value?.scan_output?.service_observations ?? 0}` },
])

function alert(type, title) { alerts.value.unshift({ id: crypto.randomUUID(), type, title, timeout: 7000 }) }
function signed(value, suffix) { return value == null ? '上期为 0 或无可比较值' : `${value > 0 ? '+' : ''}${value}${suffix}` }
function seconds(value) { return `${(Number(value || 0) / 1000).toFixed(1)} 秒` }

async function load({ silent = false } = {}) {
  clearTimeout(timer)
  controller?.abort()
  const request = new AbortController()
  controller = request
  if (!silent) loading.value = true
  const id = String(route.params.id)
  try {
    const response = await http.get(`/api/reports/${id}`, { signal: request.signal })
    if (request.signal.aborted || disposed) return
    if (!response.data?.success) throw new Error('报告加载失败')
    report.value = response.data.data
    error.value = ''
    forbidden.value = false
    const deliveryResponse = await http.get(`/api/reports/${id}/deliveries`, { signal: request.signal }).catch((e) => {
      if (!request.signal.aborted) deliveryError.value = e.response?.data?.message || '投递状态加载失败'
      return null
    })
    if (request.signal.aborted || disposed) return
    if (deliveryResponse) { deliveries.value = deliveryResponse.data.data; deliveryError.value = '' }
  } catch (e) {
    if (request.signal.aborted || disposed) return
    forbidden.value = e.response?.status === 403
    error.value = e.response?.data?.message || '报告加载失败，请重试。'
  } finally {
    if (!request.signal.aborted && !disposed) {
      loading.value = false
      if (!error.value && (['queued', 'waiting_data', 'generating'].includes(report.value?.status) || deliveries.value.some((d) => ['pending', 'sending'].includes(d.status)))) {
        timer = setTimeout(() => load({ silent: true }), 5000)
      }
    }
  }
}

async function action(name) {
  actionLoading.value = true
  const id = report.value.id
  try {
    const response = await http.post(`/api/reports/${id}/${name}`)
    if (name === 'revisions') await router.push(`/reports/${response.data.data.id}`)
    else await load({ silent: true })
  } catch (e) { alert('error', e.response?.data?.message || '操作失败') }
  finally { actionLoading.value = false }
}

async function prepareSend() {
  actionLoading.value = true
  try {
    const response = await http.get('/api/report-schedules')
    recipients.value = response.data.data.recipients.filter((u) => u.email)
    selectedRecipients.value = []
    sendDialog.value?.showModal()
  } catch (e) { alert('error', e.response?.data?.message || '收件人加载失败') }
  finally { actionLoading.value = false }
}

async function send() {
  actionLoading.value = true
  try {
    await http.post(`/api/reports/${report.value.id}/deliveries`, { recipient_ids: selectedRecipients.value })
    sendDialog.value?.close()
    alert('success', '报告邮件已加入投递队列')
    await load({ silent: true })
  } catch (e) { alert('error', e.response?.data?.message || '发送请求失败') }
  finally { actionLoading.value = false }
}

async function revokeImage() {
  if (!window.confirm('撤销后将停止从服务器加载这份报告的趋势图，待发送邮件会取消。邮箱已缓存的图像无法收回。是否继续？')) return
  actionLoading.value = true
  try {
    await http.post(`/api/reports/${report.value.id}/mail-image/revoke`)
    alert('success', '报告趋势图片已撤销')
    await load({ silent: true })
  } catch (e) { alert('error', e.response?.data?.message || '撤销失败，请稍后重试') }
  finally { actionLoading.value = false }
}

function exportCsv() {
  const url = URL.createObjectURL(new Blob([reportCsv(report.value)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${report.value.period_type}-${report.value.id}-r${report.value.revision}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function printReport() { window.print() }

watch(() => route.params.id, () => { report.value = null; deliveries.value = []; deliveryError.value = ''; load() }, { immediate: true })
onBeforeUnmount(() => { disposed = true; clearTimeout(timer); controller?.abort() })
</script>

<template>
  <div class="page-shell report-detail space-y-6">
    <AppAlert v-for="item in alerts" :key="item.id" v-bind="item" @close="alerts = alerts.filter((a) => a.id !== item.id)" />
    <div class="report-controls flex flex-wrap items-center justify-between gap-3">
      <router-link class="btn btn-sm btn-ghost" to="/reports">← 报告中心</router-link>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-sm btn-ghost" :disabled="loading" @click="load({ silent: true })">刷新</button>
        <button v-if="report?.status === 'failed'" class="btn btn-sm btn-neutral" :disabled="actionLoading" @click="action('retry')">重试生成</button>
        <button v-if="report && ['ready', 'failed'].includes(report.status)" class="btn btn-sm" :disabled="actionLoading" @click="action('revisions')">生成修订版</button>
        <template v-if="report?.status === 'ready'">
          <button class="btn btn-sm" @click="exportCsv">导出 CSV</button><button class="btn btn-sm" @click="printReport">打印</button>
          <button class="btn btn-sm btn-neutral" :disabled="actionLoading || !!report.mail_image?.revoked_at || deliveries.some((d) => ['pending', 'sending'].includes(d.status))" @click="prepareSend">发送邮件</button>
        </template>
      </div>
    </div>
    <div v-if="loading" class="grid min-h-80 place-items-center"><span class="loading loading-spinner loading-lg" /></div>
    <EmptyState v-else-if="error" type="error" :title="forbidden ? '仅管理员可以访问平台报告' : '报告加载失败'" :message="error" />
    <template v-else-if="report">
      <div class="card border border-base-300 bg-base-100 p-5">
        <div class="flex flex-wrap items-center gap-3"><h1 class="page-title">平台{{ report.period_type === 'weekly' ? '周报' : '月报' }}</h1><span class="badge badge-outline">修订 #{{ report.revision }}</span><span class="badge" :class="reportStatuses[report.status]?.class">{{ reportStatuses[report.status]?.label }}</span></div>
        <p class="mt-3 text-sm">{{ reportPeriod(report) }} · {{ reportTimezone(report) }}</p>
        <p class="mt-1 text-xs text-base-content/60">输入固定于 {{ reportDate(report.cutoff_at, true) }} · 归档于 {{ reportDate(report.generated_at, true) }}</p>
        <router-link v-if="report.supersedes_report_id" class="link mt-2 text-xs" :to="`/reports/${report.supersedes_report_id}`">查看上一修订版</router-link>
      </div>
      <div v-if="report.status !== 'ready'" role="status" class="alert" :class="report.status === 'failed' ? 'alert-error' : 'alert-info'">
        <span>{{ report.last_error || '报告已排队，正在等待生成。' }}<span v-if="report.quality?.current"> · 统计执行 {{ report.quality.current.ready }} / {{ report.quality.current.expected }}</span></span>
      </div>
      <div v-if="report.quality?.mail_error" role="alert" class="alert alert-warning"><span>报告已归档，邮件内容不可用：{{ report.quality.mail_error }}。检查邮件模板后可生成修订版。</span></div>
      <template v-if="payload">
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div v-for="card in cards" :key="card.title" class="card border border-base-300 bg-base-100 p-5"><div class="text-sm opacity-60">{{ card.title }}</div><div class="mt-2 break-words text-2xl font-semibold">{{ card.value }}</div></div></div>
        <div class="grid gap-4 lg:grid-cols-2">
          <div class="card border border-base-300 bg-base-100 p-5"><h2 class="font-semibold">任务完成情况</h2><div class="mt-4 grid grid-cols-2 gap-3 text-sm"><span>成功：{{ payload.tasks.succeeded }}</span><span>失败：{{ payload.tasks.failed }}</span><span>部分完成：{{ payload.tasks.partial }}</span><span>取消：{{ payload.tasks.cancelled }}</span></div><p class="mt-4 text-xs opacity-60">成功率 = 成功 /（成功 + 失败 + 部分完成），取消单列。</p></div>
          <div class="card border border-base-300 bg-base-100 p-5"><h2 class="font-semibold">与上一周期比较</h2><div v-if="payload.previous_available" class="mt-4 space-y-2 text-sm"><p>新建任务：{{ signed(payload.comparison.created_growth_percent, '%') }}</p><p>去重 IP：{{ signed(payload.comparison.unique_ips_growth_percent, '%') }}</p><p>日均去重 IP：{{ signed(payload.comparison.daily_unique_ips_growth_percent, '%') }}</p><p>成功率：{{ signed(payload.comparison.success_rate_change_points, ' 个百分点') }}</p></div><p v-else class="mt-4 text-sm opacity-60">上期历史或统计不完整，暂不提供环比。</p></div>
        </div>
        <div class="card border border-base-300 bg-base-100 p-5"><h2 class="font-semibold">每日完成任务</h2><ReportTrendChart :items="payload.trend" :filename="`report-${report.id}-r${report.revision}-trend`" /></div>
        <div class="grid gap-4 lg:grid-cols-2"><div v-for="dimension in [{ key: 'ports', label: '端口' }, { key: 'services', label: '服务' }]" :key="dimension.key" class="card border border-base-300 bg-base-100 p-5"><h2 class="font-semibold">{{ dimension.label }}观测 Top 10</h2><div v-if="payload.scan_output[dimension.key].length" class="mt-3 overflow-x-auto"><table class="table table-sm"><thead><tr><th>{{ dimension.label }}</th><th>观测次数</th></tr></thead><tbody><tr v-for="item in payload.scan_output[dimension.key]" :key="item.name"><td class="break-all">{{ item.name }}</td><td>{{ item.count }}</td></tr></tbody></table></div><p v-else class="mt-4 text-sm opacity-60">本期无{{ dimension.label }}观测记录。</p></div></div>
        <div class="card border border-base-300 bg-base-100 p-5"><h2 class="font-semibold">扫描器执行表现</h2><div v-if="payload.scanners.length" class="mt-3 overflow-x-auto"><table class="table table-sm"><thead><tr><th>扫描器</th><th>总执行</th><th>成功 / 失败 / 取消</th><th>成功执行平均耗时</th><th>P50 / P95</th></tr></thead><tbody><tr v-for="(scanner, index) in payload.scanners" :key="scanner.scanner_id || index"><td>{{ scanner.name }}</td><td>{{ scanner.total }}</td><td>{{ scanner.succeeded }} / {{ scanner.failed }} / {{ scanner.cancelled }}</td><td>{{ seconds(scanner.avg_duration_ms) }}</td><td>{{ seconds(scanner.p50_ms) }} / {{ seconds(scanner.p95_ms) }}</td></tr></tbody></table></div><p v-else class="mt-4 text-sm opacity-60">本期无完成执行。</p></div>
        <div class="card border border-base-300 bg-base-100 p-5"><h2 class="font-semibold">处理建议</h2><ul v-if="payload.recommendations.length" class="mt-3 list-inside list-disc space-y-2 text-sm"><li v-for="item in payload.recommendations" :key="item">{{ item }}</li></ul><p v-else class="mt-3 text-sm opacity-60">本期未发现需要提示的任务异常。</p></div>
        <div class="card border border-base-300 bg-base-100 p-5"><h2 class="font-semibold">统计口径与完整性</h2><p class="mt-3 text-sm">成功执行统计已完成：{{ report.quality.current.ready }} / {{ report.quality.current.expected }}</p><p v-for="note in payload.notes" :key="note" class="mt-2 text-xs opacity-60">{{ note }}</p><p class="mt-3 break-all font-mono text-xs opacity-50">SHA-256：{{ report.content_checksum }}</p></div>
      </template>
      <div v-if="report.mail_image" class="report-controls card border border-base-300 bg-base-100 p-5"><h2 class="font-semibold">邮件趋势图片</h2><p class="mt-3 text-sm">{{ report.mail_image.revoked_at ? '图片已撤销' : `有效期至 ${reportDate(report.mail_image.expires_at, true)}` }}</p><p class="mt-2 text-xs opacity-60">图片与当前报告版本固定对应；撤销后需要生成修订版才能再次发送。邮箱已缓存的图像可能继续显示。</p><button v-if="!report.mail_image.revoked_at" class="btn btn-sm btn-outline mt-3 self-start" :disabled="actionLoading" @click="revokeImage">撤销图片访问</button></div>
      <div class="report-controls card border border-base-300 bg-base-100 p-5"><h2 class="font-semibold">邮件投递记录</h2><p v-if="deliveryError" class="mt-3 text-sm text-error">{{ deliveryError }}</p><div v-else-if="deliveries.length" class="mt-3 overflow-x-auto"><table class="table table-sm"><thead><tr><th>收件人</th><th>批次</th><th>状态</th><th>尝试次数</th><th>说明</th></tr></thead><tbody><tr v-for="delivery in deliveries" :key="delivery.id"><td>{{ delivery.recipient }}</td><td>#{{ delivery.dispatch_seq }}</td><td>{{ deliveryStatuses[delivery.status] || delivery.status }}</td><td>{{ delivery.attempts }}</td><td class="max-w-sm break-words text-xs">{{ delivery.last_error || reportDate(delivery.sent_at, true) }}</td></tr></tbody></table></div><p v-else class="mt-3 text-sm opacity-60">尚无投递记录。手动生成与修订版默认只归档。</p></div>
    </template>
    <dialog ref="sendDialog" class="modal"><div class="modal-box"><h2 class="text-lg font-semibold">发送报告邮件</h2><p class="mt-2 text-sm opacity-60">发送当前版本的归档邮件。邮件内容取决于生成时的模板；配置远程趋势图后，图片从平台加载。发送失败会自动重试，重发会延长未撤销图片的有效期。</p><form class="mt-4" @submit.prevent="send"><label v-for="user in recipients" :key="user.id" class="mt-3 flex items-center gap-2 text-sm"><input v-model="selectedRecipients" type="checkbox" class="checkbox checkbox-sm" :value="user.id" />{{ user.username }} · {{ user.email }}</label><p v-if="!recipients.length" class="text-sm text-warning">没有可用管理员邮箱，请先完善个人信息。</p><div class="modal-action"><button type="button" class="btn" @click="sendDialog.close()">取消</button><button class="btn btn-neutral" :disabled="!selectedRecipients.length || actionLoading">确认发送</button></div></form></div><form method="dialog" class="modal-backdrop"><button>关闭</button></form></dialog>
  </div>
</template>

<style>
@media print {
  .report-controls, .drawer-side, .navbar, .modal { display: none !important; }
  .drawer-content { margin-left: 0 !important; }
  .drawer, .drawer-content { background: white !important; color: #111 !important; }
  .report-detail .card { break-inside: avoid; box-shadow: none; }
  .report-detail {
    --color-base-100: white;
    --color-base-200: #f5f5f5;
    --color-base-300: #ddd;
    --color-base-content: #111;
    color: #111;
    background: white;
  }
  .report-detail .card { background: white !important; border-color: #ddd !important; }
  .report-detail .apexcharts-text { fill: #111 !important; }
  .report-detail .apexcharts-legend-text { color: #111 !important; }
}
</style>
