<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import http from '@/utils/http'

const route = useRoute()
const taskId = computed(() => String(route.params.taskid || ''))
const task = ref(null)
const loading = ref(false)
const errorMessage = ref('')
const page = ref(1)
let refreshTimer

const displayTaskId = computed(() => taskId.value.length <= 34
  ? taskId.value
  : `${taskId.value.slice(0, 18)}...${taskId.value.slice(-8)}`)

const statusText = {
  pending: '待扫描', running: '扫描中', succeeded: '扫描完成', failed: '扫描失败', cancelled: '已取消'
}

function formatTime(value) {
  if (value === null || value === undefined) return '-'
  const date = new Date(Number(value))
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { hour12: false })
}

function formatDuration(start, end) {
  if (start == null || end == null || Number(end) < Number(start)) return '-'
  const seconds = Math.floor((Number(end) - Number(start)) / 1000)
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes} 分 ${seconds % 60} 秒` : `${seconds} 秒`
}

const taskRemark = computed(() => task.value?.remarks || '-')
const taskMeta = computed(() => ({
  status: statusText[task.value?.task_status] || '未知',
  priority: task.value?.task_level ?? '-',
  attemptCount: task.value?.attempt_count ?? 0,
  failureReason: task.value?.failure_reason || ''
}))
const summaryStats = computed(() => [
  { title: '发现 IP 数', value: task.value?.summary?.ip_count ?? 0, desc: '' },
  { title: '开放端口数', value: task.value?.summary?.port_count ?? 0, desc: '' },
  { title: '结果记录数', value: task.value?.summary?.result_count ?? 0, desc: '' },
  { title: '扫描耗时', value: formatDuration(task.value?.task_start_time, task.value?.task_end_time), desc: '总耗时' }
])
const taskDetail = computed(() => ({
  targetIp: task.value?.task_target?.join(', ') || '-',
  port: task.value?.task_port || '-',
  scanType: '端口扫描',
  startTime: formatTime(task.value?.task_start_time),
  endTime: formatTime(task.value?.task_end_time),
  starter: task.value?.task_initiator || '-',
  scanner: task.value?.scanner_name || task.value?.scanner_id || '-'
}))
const resultByIp = computed(() => (task.value?.results || []).map((item) => ({
  ip: item.ip,
  ports: item.ports,
  asn: item.asn,
  isp: item.isp
})))
const timelineSteps = computed(() => {
  if (!task.value) return []
  const steps = [{ time: formatTime(task.value.task_create_time), label: '创建扫描任务' }]
  if (task.value.task_start_time) steps.push({ time: formatTime(task.value.task_start_time), label: '扫描器开始执行' })
  if (task.value.task_end_time) steps.push({
    time: formatTime(task.value.task_end_time),
    label: task.value.task_status === 'failed' ? `扫描失败：${task.value.failure_reason || '未知原因'}` : '扫描结束'
  })
  return steps
})
const activeStepIndex = computed(() => timelineSteps.value.length - 1)
const asnIspRows = computed(() => (task.value?.results || []).map((item, index) => ({
  index: index + 1,
  ipCidr: item.ip,
  name: item.isp || '-',
  asnumber: item.asn || '-',
  adminC: '-'
})))

async function loadTask({ silent = false } = {}) {
  if (!silent) loading.value = true
  try {
    const response = await http.get(`/api/task/${taskId.value}`, { params: { page: page.value, page_size: 20 } })
    if (response.data?.success !== true || !response.data?.data) throw new Error('服务器未返回有效任务数据')
    task.value = response.data.data
    errorMessage.value = ''
  } catch (error) {
    console.error('load task detail failed', error)
    if (!silent) errorMessage.value = error?.response?.status === 404 ? '任务不存在或无权查看' : '任务详情加载失败'
  } finally {
    loading.value = false
  }
}

async function changePage(nextPage) {
  const totalPages = task.value?.pagination?.total_pages || 1
  if (nextPage < 1 || nextPage > totalPages || loading.value) return
  page.value = nextPage
  await loadTask()
}

function isNodeActive(index) {
  return index <= activeStepIndex.value
}

function isPrevLineActive(index) {
  return index > 0 && index <= activeStepIndex.value
}

function isNextLineActive(index) {
  return index < timelineSteps.value.length - 1 && index < activeStepIndex.value
}

async function copyTaskId() {
  const text = taskId.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch (error) {
    const textArea = document.createElement('textarea')
    textArea.value = text
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
  }
}

watch(taskId, () => {
  page.value = 1
  loadTask()
  window.clearInterval(refreshTimer)
  refreshTimer = window.setInterval(() => loadTask({ silent: true }), 30000)
}, { immediate: true })

onBeforeUnmount(() => window.clearInterval(refreshTimer))
</script>

<template>
  <div class="p-5">
    <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-2">
      <div class="min-w-0 flex items-center gap-2">
        <h2 class="text-lg font-semibold truncate text-left" :title="taskId">
          任务 UUID：{{ displayTaskId }}
        </h2>
        <div class="tooltip tooltip-bottom" :data-tip="taskId">
          <button class="btn btn-ghost btn-xs gap-1" @click="copyTaskId">
            UUID
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-files-icon lucide-files size-3.5"><path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/><path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z"/><path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1"/></svg>
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-start md:justify-end gap-2">
        <button class="btn btn-ghost btn-sm" :disabled="loading" @click="loadTask()">刷新</button>
        <router-link to="/task" class="btn btn-ghost btn-sm">返回列表</router-link>
      </div>
    </div>

    <div v-if="loading && !task" class="grid min-h-80 place-items-center rounded-lg bg-base-200/60">
      <span class="loading loading-spinner loading-md"></span>
    </div>
    <div v-else-if="errorMessage" role="alert" class="alert alert-error"><span>{{ errorMessage }}</span></div>
    <template v-else-if="task">
    <p class="text-sm opacity-70 mb-4 break-words">备注：{{ taskRemark }}</p>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
      <div class="xl:col-span-2 flex flex-col gap-5">
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div v-for="item in summaryStats" :key="item.title" class="stats shadow border border-base-300 bg-base-100">
            <div class="stat">
              <div class="stat-title">{{ item.title }}</div>
              <div class="stat-value text-2xl">{{ item.value }}</div>
              <div class="stat-desc">{{ item.desc }}</div>
            </div>
          </div>
        </div>

        <div class="card bg-base-100 card-border border-base-300 p-4">
          <h3 class="font-semibold mb-3">任务细节</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div class="rounded-lg bg-base-200/50 p-3"><span class="opacity-60">目标 IP：</span>{{ taskDetail.targetIp }}</div>
            <div class="rounded-lg bg-base-200/50 p-3"><span class="opacity-60">Port：</span>{{ taskDetail.port }}</div>
            <div class="rounded-lg bg-base-200/50 p-3"><span class="opacity-60">扫描类型：</span>{{ taskDetail.scanType }}</div>
            <div class="rounded-lg bg-base-200/50 p-3"><span class="opacity-60">扫描发起人：</span>{{ taskDetail.starter }}</div>
            <div class="rounded-lg bg-base-200/50 p-3"><span class="opacity-60">开始时间：</span>{{ taskDetail.startTime }}</div>
            <div class="rounded-lg bg-base-200/50 p-3"><span class="opacity-60">结束时间：</span>{{ taskDetail.endTime }}</div>
            <div class="rounded-lg bg-base-200/50 p-3 md:col-span-2"><span class="opacity-60">执行扫描器：</span>{{ taskDetail.scanner }}</div>
          </div>
        </div>

        <div class="card bg-base-100 card-border border-base-300 p-4">
          <h3 class="font-semibold mb-3">结果展示</h3>
          <div class="flex flex-col gap-2">
            <div v-if="resultByIp.length === 0" class="rounded-lg bg-base-200/60 p-6 text-center text-sm opacity-70">暂无扫描结果</div>
            <div v-for="row in resultByIp" :key="row.ip" class="overflow-hidden rounded-lg border border-base-300 bg-base-100 text-sm">
              <div class="flex flex-wrap items-center justify-between gap-2 bg-base-200/60 px-3 py-2">
                <span class="font-medium">{{ row.ip }}</span>
                <span class="text-xs opacity-70">ASN / ISP：{{ row.asn || '-' }} / {{ row.isp || '-' }}</span>
              </div>
              <div class="overflow-x-auto">
                <table class="table table-sm">
                  <thead><tr><th>端口</th><th>协议</th><th>服务</th><th>Banner</th><th>扫描时间</th></tr></thead>
                  <tbody>
                    <tr v-for="port in row.ports" :key="port.port">
                      <td>{{ port.port }}</td>
                      <td>{{ port.protocol || '-' }}</td>
                      <td>{{ port.service || '-' }}</td>
                      <td class="max-w-72 truncate" :title="port.banner || ''">{{ port.banner || '-' }}</td>
                      <td class="whitespace-nowrap">{{ formatTime(port.scan_time) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div v-if="task.pagination.total_pages > 1" class="mt-4 flex items-center justify-between">
            <span class="text-sm opacity-70">第 {{ task.pagination.page }} / {{ task.pagination.total_pages }} 页</span>
            <div class="join">
              <button class="join-item btn btn-sm" :disabled="page <= 1 || loading" @click="changePage(page - 1)">上一页</button>
              <button class="join-item btn btn-sm" :disabled="page >= task.pagination.total_pages || loading" @click="changePage(page + 1)">下一页</button>
            </div>
          </div>
        </div>
      </div>

      <div class="xl:col-span-1 flex flex-col gap-5">
        <div class="card bg-base-100 card-border border-base-300 p-4">
          <h3 class="font-semibold mb-3">执行状态</h3>
          <div class="flex w-full flex-col text-sm">
            <div class="card bg-base-200 rounded-box px-3 py-2">扫描状态：{{ taskMeta.status }}</div>
            <div class="card bg-base-200 rounded-box px-3 py-2 mt-2">优先级：{{ taskMeta.priority }}</div>
            <div class="card bg-base-200 rounded-box px-3 py-2 mt-2">领取次数：{{ taskMeta.attemptCount }}</div>
            <div v-if="taskMeta.failureReason" class="card bg-error/10 rounded-box px-3 py-2 mt-2 text-error">失败原因：{{ taskMeta.failureReason }}</div>
          </div>

          <div class="divider my-3">Timeline</div>

          <div>
            <ul class="timeline timeline-vertical">
              <li v-for="(step, index) in timelineSteps" :key="step.label">
                <hr v-if="index > 0" :class="isPrevLineActive(index) ? 'bg-neutral' : ''" />
                <div class="timeline-start text-xs opacity-70">{{ step.time }}</div>
                <div class="timeline-middle">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    class="h-5 w-5"
                    :class="isNodeActive(index) ? 'text-neutral' : 'opacity-40'"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </div>
                <div class="timeline-end timeline-box text-sm">{{ step.label }}</div>
                <hr v-if="index < timelineSteps.length - 1" :class="isNextLineActive(index) ? 'bg-neutral' : ''" />
              </li>
            </ul>
          </div>
        </div>

        <div class="card bg-base-100 card-border border-base-300 p-4">
          <h3 class="font-semibold mb-3">ASN&ISP</h3>
          <div class="overflow-x-auto rounded-box border border-base-300">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th></th>
                  <th>IP/CIDR</th>
                  <th>Name</th>
                  <th>ASNumber</th>
                  <th>Admin-c</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in asnIspRows" :key="`${row.index}-${row.ipCidr}`">
                  <td>{{ row.index }}</td>
                  <td>{{ row.ipCidr }}</td>
                  <td>{{ row.name }}</td>
                  <td>{{ row.asnumber }}</td>
                  <td>{{ row.adminC }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>
