<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import http from '@/utils/http'

const alerts = ref([])
const summary = ref({ enabled: false, available: false, stanza: '', operationRunning: false, stanzas: [] })
const jobs = ref([])
const loading = ref(false)
const submitting = ref(false)
const initialLoadFailed = ref(false)
const backupDialog = ref(null)
const logDialog = ref(null)
const selectedJob = ref(null)
const jobDetailLoading = ref(false)
const form = ref({ type: 'incr', remark: '' })
let pollTimer

const backupTypeInfo = {
  full: { label: '全量', class: 'badge-primary' },
  diff: { label: '差异', class: 'badge-secondary' },
  incr: { label: '增量', class: 'badge-accent' },
  check: { label: '归档检查', class: 'badge-info' }
}

const jobStatusInfo = {
  queued: { label: '等待执行', class: 'badge-ghost' },
  running: { label: '执行中', class: 'badge-info' },
  succeeded: { label: '成功', class: 'badge-success' },
  failed: { label: '失败', class: 'badge-error' }
}

const backupSets = computed(() => {
  const items = []
  for (const stanza of summary.value.stanzas || []) {
    for (const backup of stanza.backup || []) {
      items.push({ ...backup, stanza: stanza.name })
    }
  }
  return items.sort((left, right) => backupStop(right) - backupStop(left))
})

const latestBackup = computed(() => backupSets.value[0] || null)
const failedJobs = computed(() => jobs.value.filter((job) => job.status === 'failed').length)
const activeJob = computed(() => jobs.value.find((job) => ['queued', 'running'].includes(job.status)))

function pushAlert(type, title, description = '', timeout = 7000) {
  alerts.value.unshift({ id: crypto.randomUUID(), type, title, description, timeout })
}

function closeAlert(id) {
  alerts.value = alerts.value.filter((alert) => alert.id !== id)
}

function apiMessage(error, fallback) {
  if (error?.response?.status === 403) return '仅管理员可以执行此操作。'
  if (error?.response?.status === 409) return error.response.data?.message || '已有任务正在运行。'
  return error?.response?.data?.message || fallback
}

function backupStop(backup) {
  return Number(backup?.timestamp?.stop || backup?.timestamp?.start || 0)
}

function formatEpoch(value) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return '--'
  return new Date(seconds * 1000).toLocaleString('zh-CN', { hour12: false })
}

function formatTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('zh-CN', { hour12: false })
}

function formatBytes(value) {
  let bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '--'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let unit = 0
  while (bytes >= 1024 && unit < units.length - 1) {
    bytes /= 1024
    unit += 1
  }
  return `${bytes.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function backupSize(backup) {
  return backup?.info?.repository?.size ?? backup?.info?.size
}

function backupType(value) {
  return backupTypeInfo[value] || { label: value || '未知', class: 'badge-ghost' }
}

function jobStatus(value) {
  return jobStatusInfo[value] || { label: value || '未知', class: 'badge-ghost' }
}

async function loadData({ silent = false } = {}) {
  if (loading.value) return
  loading.value = true
  try {
    const [summaryResponse, jobsResponse] = await Promise.all([
      http.get('/api/admin/backups/summary'),
      http.get('/api/admin/backups/jobs', { params: { page: 1, page_size: 20 } })
    ])
    summary.value = summaryResponse.data || summary.value
    jobs.value = jobsResponse.data?.items || []
    initialLoadFailed.value = false
  } catch (error) {
    console.error('load backup management data failed', error)
    initialLoadFailed.value = true
    if (!silent) pushAlert('error', '备份信息加载失败', apiMessage(error, '请检查服务器和数据库状态。'))
  } finally {
    loading.value = false
  }
}

function openBackupDialog(type = 'incr') {
  form.value = { type, remark: '' }
  backupDialog.value?.showModal()
}

async function submitBackup() {
  if (submitting.value) return
  submitting.value = true
  try {
    await http.post('/api/admin/backups/jobs', {
      type: form.value.type,
      remark: form.value.remark.trim() || null
    })
    backupDialog.value?.close()
    pushAlert('success', '备份任务已提交', '任务正在后台执行，可以在任务记录中查看进度。', 5000)
    await loadData({ silent: true })
  } catch (error) {
    console.error('submit backup failed', error)
    pushAlert('error', '备份任务提交失败', apiMessage(error, '请稍后重试。'))
  } finally {
    submitting.value = false
  }
}

async function runCheck() {
  if (submitting.value || !window.confirm('执行 pgBackRest 检查并验证 WAL 归档链路吗？')) return
  submitting.value = true
  try {
    await http.post('/api/admin/backups/check')
    pushAlert('success', '检查任务已提交', '检查结果将显示在任务记录中。', 5000)
    await loadData({ silent: true })
  } catch (error) {
    console.error('submit backup check failed', error)
    pushAlert('error', '检查任务提交失败', apiMessage(error, '请稍后重试。'))
  } finally {
    submitting.value = false
  }
}

async function openJobDetail(job) {
  selectedJob.value = job
  jobDetailLoading.value = true
  logDialog.value?.showModal()
  try {
    const response = await http.get(`/api/admin/backups/jobs/${job.id}`)
    selectedJob.value = response.data?.data || job
  } catch (error) {
    console.error('load backup job detail failed', error)
    pushAlert('error', '任务日志加载失败', apiMessage(error, '请稍后重试。'))
  } finally {
    jobDetailLoading.value = false
  }
}

onMounted(async () => {
  await loadData()
  pollTimer = window.setInterval(() => loadData({ silent: true }), 10000)
})

onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer)
})
</script>

<template>
  <div class="pointer-events-none fixed top-20 left-1/2 z-50 flex w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2 sm:left-auto sm:right-5 sm:w-auto sm:translate-x-0 sm:items-end">
    <AppAlert v-for="alert in alerts" :key="alert.id" class="pointer-events-auto" v-bind="alert" @close="closeAlert(alert.id)" />
  </div>

  <main class="p-4 md:p-6">
    <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold">数据备份</h1>
        <p class="mt-1 text-sm text-base-content/60">管理 pgBackRest 备份集、手动任务和 WAL 归档检查。</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-ghost btn-sm" :disabled="loading" @click="loadData()">
          <span v-if="loading" class="loading loading-spinner loading-xs"></span>
          刷新
        </button>
        <button class="btn btn-outline btn-sm" :disabled="!summary.enabled || submitting || summary.operationRunning" @click="runCheck">运行检查</button>
        <button class="btn btn-primary btn-sm" :disabled="!summary.enabled || submitting || summary.operationRunning" @click="openBackupDialog()">立即备份</button>
      </div>
    </div>

    <EmptyState
      v-if="initialLoadFailed"
      type="error"
      title="加载数据失败"
      message="无法读取备份状态，请检查网络连接和服务器运行状态。"
    />

    <template v-else>
      <div v-if="!summary.enabled" role="alert" class="alert alert-warning mb-4">
        <span>pgBackRest Web 管理功能尚未启用。请先完成 stanza 初始化和服务端 `[backup]` 配置。</span>
      </div>
      <div v-else-if="!summary.available" role="alert" class="alert alert-error mb-4">
        <span>无法读取 pgBackRest 状态：{{ summary.message || '请检查二进制路径、配置文件和运行账户权限。' }}</span>
      </div>

      <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="stat rounded-box border border-base-300 bg-base-100 shadow-sm">
          <div class="stat-title">Stanza</div>
          <div class="stat-value truncate text-xl">{{ summary.stanza || '--' }}</div>
          <div class="stat-desc">{{ summary.available ? '状态正常' : '当前不可用' }}</div>
        </div>
        <div class="stat rounded-box border border-base-300 bg-base-100 shadow-sm">
          <div class="stat-title">最近成功备份</div>
          <div class="stat-value text-lg">{{ latestBackup ? backupType(latestBackup.type).label : '--' }}</div>
          <div class="stat-desc">{{ latestBackup ? formatEpoch(backupStop(latestBackup)) : '暂无备份集' }}</div>
        </div>
        <div class="stat rounded-box border border-base-300 bg-base-100 shadow-sm">
          <div class="stat-title">可用备份集</div>
          <div class="stat-value text-2xl">{{ backupSets.length }}</div>
          <div class="stat-desc">来自 pgBackRest 仓库元数据</div>
        </div>
        <div class="stat rounded-box border border-base-300 bg-base-100 shadow-sm">
          <div class="stat-title">任务状态</div>
          <div class="stat-value text-lg">{{ activeJob ? '执行中' : '空闲' }}</div>
          <div class="stat-desc">最近 20 条中失败 {{ failedJobs }} 条</div>
        </div>
      </section>

      <section class="mt-5 overflow-hidden rounded-box border border-base-300 bg-base-100">
        <div class="flex items-center justify-between border-b border-base-300 px-4 py-3">
          <div>
            <h2 class="font-semibold">备份集</h2>
            <p class="text-xs text-base-content/55">定时和手动生成的真实仓库备份。</p>
          </div>
        </div>
        <div v-if="loading && !backupSets.length" class="p-5"><div class="skeleton h-48 w-full"></div></div>
        <EmptyState v-else-if="backupSets.length === 0" title="暂无备份集" message="完成第一次全量备份后，备份集会显示在这里。" />
        <div v-else class="overflow-x-auto">
          <table class="table table-zebra">
            <thead><tr><th>标签</th><th>类型</th><th>完成时间</th><th>仓库大小</th><th>数据库 ID</th></tr></thead>
            <tbody>
              <tr v-for="backup in backupSets" :key="`${backup.stanza}-${backup.label}`">
                <td class="font-mono text-xs">{{ backup.label }}</td>
                <td><span class="badge badge-sm" :class="backupType(backup.type).class">{{ backupType(backup.type).label }}</span></td>
                <td>{{ formatEpoch(backupStop(backup)) }}</td>
                <td>{{ formatBytes(backupSize(backup)) }}</td>
                <td>{{ backup.database?.id ?? '--' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="mt-5 overflow-hidden rounded-box border border-base-300 bg-base-100">
        <div class="border-b border-base-300 px-4 py-3">
          <h2 class="font-semibold">手动任务</h2>
          <p class="text-xs text-base-content/55">页面提交的备份和检查操作；点击记录查看完整输出。</p>
        </div>
        <EmptyState v-if="jobs.length === 0" title="暂无手动任务" message="可以运行一次检查或立即备份。" />
        <div v-else class="overflow-x-auto">
          <table class="table table-zebra">
            <thead><tr><th>创建时间</th><th>操作</th><th>状态</th><th>发起人</th><th>耗时</th><th></th></tr></thead>
            <tbody>
              <tr v-for="job in jobs" :key="job.id">
                <td>{{ formatTime(job.createdAt) }}</td>
                <td><span class="badge badge-sm" :class="backupType(job.operation).class">{{ backupType(job.operation).label }}</span></td>
                <td><span class="badge badge-sm" :class="jobStatus(job.status).class">{{ jobStatus(job.status).label }}</span></td>
                <td>{{ job.requestedByName || '--' }}</td>
                <td>{{ job.startedAt && job.finishedAt ? `${Math.max(0, Math.round((new Date(job.finishedAt) - new Date(job.startedAt)) / 1000))} 秒` : '--' }}</td>
                <td><button class="btn btn-ghost btn-xs" @click="openJobDetail(job)">查看日志</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="mt-5 card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body p-4">
          <h2 class="font-semibold">默认定时策略</h2>
          <div class="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-box bg-base-200 p-3"><div class="font-medium">全量</div><div class="text-base-content/60">周日 02:10</div></div>
            <div class="rounded-box bg-base-200 p-3"><div class="font-medium">差异</div><div class="text-base-content/60">周一至周六 02:10</div></div>
            <div class="rounded-box bg-base-200 p-3"><div class="font-medium">增量</div><div class="text-base-content/60">每天 08:10 / 14:10 / 20:10</div></div>
            <div class="rounded-box bg-base-200 p-3"><div class="font-medium">归档检查</div><div class="text-base-content/60">每天 01:30</div></div>
          </div>
          <p class="text-xs text-base-content/55">计划由服务器 systemd timer 独立执行；实际启用状态请在服务器上通过 systemctl list-timers 检查。</p>
        </div>
      </section>
    </template>
  </main>

  <dialog ref="backupDialog" class="modal">
    <div class="modal-box">
      <h3 class="text-lg font-semibold">立即备份</h3>
      <p class="mt-1 text-sm text-base-content/60">任务提交后会在后台运行，同一时间只允许一个备份或检查任务。</p>
      <div class="mt-5 space-y-4">
        <label class="form-control">
          <span class="label-text mb-1">备份类型</span>
          <select v-model="form.type" class="select select-bordered w-full">
            <option value="incr">增量备份</option>
            <option value="diff">差异备份</option>
            <option value="full">全量备份</option>
          </select>
        </label>
        <label class="form-control">
          <span class="label-text mb-1">操作备注</span>
          <textarea v-model="form.remark" maxlength="500" class="textarea textarea-bordered min-h-24" placeholder="例如：版本发布前备份"></textarea>
        </label>
      </div>
      <div class="modal-action">
        <form method="dialog"><button class="btn btn-ghost" :disabled="submitting">取消</button></form>
        <button class="btn btn-primary" :disabled="submitting" @click="submitBackup">
          <span v-if="submitting" class="loading loading-spinner loading-sm"></span>
          确认执行
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>关闭</button></form>
  </dialog>

  <dialog ref="logDialog" class="modal">
    <div class="modal-box max-w-4xl">
      <h3 class="text-lg font-semibold">任务日志</h3>
      <div v-if="jobDetailLoading" class="mt-4"><div class="skeleton h-64 w-full"></div></div>
      <div v-else-if="selectedJob" class="mt-4 space-y-4">
        <div class="grid gap-2 text-sm sm:grid-cols-3">
          <div><span class="text-base-content/55">任务 ID</span><div class="break-all font-mono text-xs">{{ selectedJob.id }}</div></div>
          <div><span class="text-base-content/55">状态</span><div>{{ jobStatus(selectedJob.status).label }}</div></div>
          <div><span class="text-base-content/55">退出码</span><div>{{ selectedJob.exitCode ?? '--' }}</div></div>
        </div>
        <div>
          <div class="mb-1 text-sm font-medium">标准输出</div>
          <pre class="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-box bg-neutral p-3 text-xs text-neutral-content">{{ selectedJob.stdout || '无输出' }}</pre>
        </div>
        <div>
          <div class="mb-1 text-sm font-medium">错误输出</div>
          <pre class="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-box bg-neutral p-3 text-xs text-neutral-content">{{ selectedJob.stderr || '无输出' }}</pre>
        </div>
      </div>
      <div class="modal-action"><form method="dialog"><button class="btn">关闭</button></form></div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>关闭</button></form>
  </dialog>
</template>
