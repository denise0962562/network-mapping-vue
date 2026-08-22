<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import http from '@/utils/http'

const alerts = ref([])
const summary = ref({
  enabled: false,
  available: false,
  stanza: '',
  executionMode: 'direct',
  runAsUser: null,
  operationRunning: false,
  stanzas: []
})
const jobs = ref([])
const loading = ref(false)
const submitting = ref(false)
const initialLoadFailed = ref(false)
const backupDialog = ref(null)
const logDialog = ref(null)
const guideDialog = ref(null)
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

const backupTypeDescriptions = {
  full: '读取完整数据库集群并建立新的备份基线，耗时和占用空间最大。首次部署、仓库重建或重大数据变更前优先选择。',
  diff: '保存相对最近一次全量备份发生的变化，空间和耗时通常介于全量与增量之间，恢复链路较短。',
  incr: '保存相对最近一次成功备份发生的变化，适合发布前和缩短备份间隔，但恢复依赖的备份链更长。'
}

const stanzaStatusLabels = {
  0: '正常',
  1: 'Stanza 路径不存在',
  2: '没有有效备份',
  3: 'Stanza 元数据缺失',
  4: '多仓库状态不一致',
  5: '数据库身份不匹配',
  6: '指定备份不存在',
  99: '仓库或权限错误'
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
const targetStanza = computed(() => (
  (summary.value.stanzas || []).find((stanza) => stanza.name === summary.value.stanza)
  || summary.value.stanzas?.[0]
  || null
))
const stanzaStatusCode = computed(() => {
  const value = Number(targetStanza.value?.status?.code)
  return Number.isFinite(value) ? value : null
})
const stanzaHealthy = computed(() => summary.value.available && stanzaStatusCode.value === 0)
const executorText = computed(() => (
  summary.value.executionMode === 'sudo' && summary.value.runAsUser
    ? `sudo → ${summary.value.runAsUser}`
    : '服务账户直接执行'
))
const stanzaStatusText = computed(() => {
  if (!summary.value.enabled) return '管理功能未启用'
  if (!summary.value.available) return '无法运行 info 命令'
  if (stanzaStatusCode.value === null) return '未返回 Stanza 状态'
  return stanzaStatusLabels[stanzaStatusCode.value]
    || targetStanza.value?.status?.message
    || `未知状态 ${stanzaStatusCode.value}`
})
const selectedBackupDescription = computed(() => backupTypeDescriptions[form.value.type] || '')

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

function openGuide() {
  guideDialog.value?.showModal()
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
        <button type="button" class="btn btn-ghost btn-sm" @click="openGuide">使用指南</button>
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
      <div v-else-if="!stanzaHealthy" role="alert" class="alert alert-warning mb-4">
        <div>
          <div class="font-medium">Stanza 当前状态：{{ stanzaStatusText }}</div>
          <div class="text-sm opacity-75">info 命令可以运行，但仓库状态码为 {{ stanzaStatusCode ?? '未知' }}。请打开“使用指南”查看状态码说明和处理步骤。</div>
        </div>
      </div>

      <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="stat rounded-box border border-base-300 bg-base-100 shadow-sm">
          <div class="stat-title">Stanza</div>
          <div class="stat-value truncate text-xl">{{ summary.stanza || '--' }}</div>
          <div class="stat-desc">{{ stanzaStatusText }}<span v-if="stanzaStatusCode !== null">（代码 {{ stanzaStatusCode }}）</span> · {{ executorText }}</div>
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

      <section class="mt-5 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="font-semibold">快速使用流程</h2>
            <p class="mt-1 text-xs text-base-content/55">首次使用请按顺序完成，成功执行命令不等于已经验证可恢复。</p>
          </div>
          <button type="button" class="btn btn-link btn-sm h-auto min-h-0 px-0" @click="openGuide">查看完整部署、操作与排障指南</button>
        </div>
        <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-box bg-base-200 p-3">
            <div class="flex items-center gap-2"><span class="badge badge-neutral badge-sm">1</span><span class="font-medium">确认基础状态</span></div>
            <p class="mt-2 text-sm text-base-content/65">Stanza 状态码应为 0；首次部署没有备份时可能为 2。</p>
          </div>
          <div class="rounded-box bg-base-200 p-3">
            <div class="flex items-center gap-2"><span class="badge badge-neutral badge-sm">2</span><span class="font-medium">运行归档检查</span></div>
            <p class="mt-2 text-sm text-base-content/65">验证数据目录、数据库身份、配置和 WAL 是否能到达仓库。</p>
          </div>
          <div class="rounded-box bg-base-200 p-3">
            <div class="flex items-center gap-2"><span class="badge badge-neutral badge-sm">3</span><span class="font-medium">创建备份</span></div>
            <p class="mt-2 text-sm text-base-content/65">首次先做全量；日常按变更规模选择差异或增量并填写备注。</p>
          </div>
          <div class="rounded-box bg-base-200 p-3">
            <div class="flex items-center gap-2"><span class="badge badge-neutral badge-sm">4</span><span class="font-medium">核对并演练恢复</span></div>
            <p class="mt-2 text-sm text-base-content/65">确认新标签、任务日志和 timer，并在隔离环境定期恢复。</p>
          </div>
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

  <dialog ref="guideDialog" class="modal">
    <div class="modal-box max-h-[90vh] max-w-5xl overflow-y-auto p-0">
      <div class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-base-300 bg-base-100 px-5 py-4">
        <div>
          <h2 class="text-xl font-semibold">pgBackRest 数据备份使用指南</h2>
          <p class="mt-1 text-sm text-base-content/60">从首次启用、日常操作到错误排查和恢复演练。</p>
        </div>
        <form method="dialog"><button class="btn btn-ghost btn-sm" aria-label="关闭使用指南">关闭</button></form>
      </div>

      <div class="space-y-4 p-5">
        <div role="alert" class="alert alert-warning">
          <div>
            <div class="font-medium">备份成功不等于可恢复</div>
            <div class="text-sm opacity-75">必须定期在隔离环境执行真实恢复。当前页面不会执行恢复、删除备份或修改保留策略。</div>
          </div>
        </div>

        <details class="collapse collapse-arrow border border-base-300 bg-base-100" open>
          <summary class="collapse-title font-semibold">1. 首次启用前需要完成什么？</summary>
          <div class="collapse-content space-y-3 text-sm text-base-content/75">
            <ol class="list-decimal space-y-2 pl-5">
              <li>在 PostgreSQL 主机安装 pgBackRest，并确认数据库版本、数据目录和端口。</li>
              <li>创建独立备份仓库，限制目录和配置文件权限；仓库不能位于 PostgreSQL 数据目录内。</li>
              <li>配置 <code class="rounded bg-base-200 px-1">archive_mode=on</code> 和包含 pgBackRest 的 <code class="rounded bg-base-200 px-1">archive_command</code>。</li>
              <li>创建 stanza，运行检查并完成第一次全量备份。</li>
              <li>启用服务端 <code class="rounded bg-base-200 px-1">[backup]</code> 配置，重启服务后再安装 systemd timers。</li>
            </ol>
            <pre class="overflow-x-auto rounded-box bg-neutral p-3 text-xs text-neutral-content"><code>sudo -u postgres pgbackrest --stanza={{ summary.stanza || 'network_mapping' }} stanza-create
sudo -u postgres pgbackrest --stanza={{ summary.stanza || 'network_mapping' }} check
sudo -u postgres pgbackrest --stanza={{ summary.stanza || 'network_mapping' }} --type=full backup
sudo -u postgres pgbackrest --stanza={{ summary.stanza || 'network_mapping' }} info</code></pre>
            <p>目标 stanza 的仓库目录必须为空。首次全量成功前不要启用差异或增量定时任务。</p>
          </div>
        </details>

        <details class="collapse collapse-arrow border border-base-300 bg-base-100">
          <summary class="collapse-title font-semibold">2. 如何安全地让 postgres 执行？</summary>
          <div class="collapse-content space-y-3 text-sm text-base-content/75">
            <p>当 pgBackRest 必须以 <code class="rounded bg-base-200 px-1">postgres</code> 运行时，不要把 Network Mapping 改成 root。请使用仓库提供的精确 sudoers 模板，让服务账户只能执行 info、check 和三种 backup 命令。</p>
            <div role="note" class="rounded-box border border-base-300 bg-base-200 p-3">
              <div class="font-medium">当前后端执行方式：{{ executorText }}</div>
              <div class="mt-1 text-xs">如果这里未显示“sudo → postgres”，说明服务端尚未启用 run_as_user 配置。</div>
            </div>
            <ol class="list-decimal space-y-2 pl-5">
              <li>确认 systemd 的 <code class="rounded bg-base-200 px-1">User=network-mapping</code>、<code class="rounded bg-base-200 px-1">NoNewPrivileges=no</code>、sudo 和 pgBackRest 的实际绝对路径。如必须保留 NoNewPrivileges，需改用只暴露固定操作的本机代理。</li>
              <li>在服务端 <code class="rounded bg-base-200 px-1">config.toml</code> 的 <code class="rounded bg-base-200 px-1">[backup]</code> 中固定执行账户和 sudo 路径。</li>
            </ol>
            <pre class="overflow-x-auto rounded-box bg-neutral p-3 text-xs text-neutral-content"><code>run_as_user = "postgres"
sudo_binary = "/usr/bin/sudo"</code></pre>
            <ol start="3" class="list-decimal space-y-2 pl-5">
              <li>使用 <code class="rounded bg-base-200 px-1">visudo -cf</code> 检查 <code class="rounded bg-base-200 px-1">deploy/sudoers/network-mapping-pgbackrest</code>，然后以 root:root、0440 安装到 <code class="rounded bg-base-200 px-1">/etc/sudoers.d/</code>。</li>
              <li>重启后端，刷新本页，确认显示“sudo → postgres”并能读取 stanza 状态。</li>
              <li>除正向 info/check 测试外，必须验证更换 stanza、restore 和 <code class="rounded bg-base-200 px-1">/bin/sh</code> 全部被 sudo 拒绝。</li>
            </ol>
            <pre class="overflow-x-auto rounded-box bg-neutral p-3 text-xs text-neutral-content"><code># 正向：必须成功
sudo -u network-mapping sudo -n -u postgres -- \
  /usr/bin/pgbackrest --config=/etc/pgbackrest/pgbackrest.conf \
  --stanza={{ summary.stanza || 'network_mapping' }} --output=json info

# 反向：必须被拒绝
sudo -u network-mapping sudo -n -u postgres -- \
  /usr/bin/pgbackrest --config=/etc/pgbackrest/pgbackrest.conf \
  --stanza={{ summary.stanza || 'network_mapping' }} restore
sudo -u network-mapping sudo -n -u postgres -- /bin/sh -c id</code></pre>
            <p>不要授权无参数的 <code class="rounded bg-base-200 px-1">/usr/bin/pgbackrest</code>、<code class="rounded bg-base-200 px-1">pgbackrest *</code>、任意脚本或 shell。完整的可复制 sudoers 内容、安装命令和反向测试见项目文档 <code class="rounded bg-base-200 px-1">docs/PGBACKREST_BACKUP.md</code>。</p>
          </div>
        </details>

        <details class="collapse collapse-arrow border border-base-300 bg-base-100">
          <summary class="collapse-title font-semibold">3. 如何判断页面状态？</summary>
          <div class="collapse-content space-y-3 text-sm text-base-content/75">
            <p><strong>命令可用</strong>只表示后端能运行并解析 <code>pgbackrest info --output=json</code>；还必须检查 stanza 自身的状态码。</p>
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead><tr><th>状态码</th><th>含义</th><th>建议</th></tr></thead>
                <tbody>
                  <tr><td>0</td><td>正常</td><td>继续核对最近备份时间和恢复演练</td></tr>
                  <tr><td>1</td><td>Stanza 路径不存在</td><td>检查仓库路径并执行 stanza-create</td></tr>
                  <tr><td>2</td><td>没有有效备份</td><td>执行第一次全量备份</td></tr>
                  <tr><td>3</td><td>Stanza 元数据缺失</td><td>检查仓库完整性、权限和初始化步骤</td></tr>
                  <tr><td>4</td><td>多仓库状态不一致</td><td>分别核对各仓库配置和可访问性</td></tr>
                  <tr><td>5</td><td>数据库身份不匹配</td><td>停止写入并确认 pg1-path 指向正确实例</td></tr>
                  <tr><td>6</td><td>指定备份不存在</td><td>核对备份标签和仓库</td></tr>
                  <tr><td>99</td><td>其他仓库错误</td><td>检查网络、对象存储、权限和详细日志</td></tr>
                </tbody>
              </table>
            </div>
            <p>当前页面状态：<span class="font-medium">{{ stanzaStatusText }}</span><span v-if="stanzaStatusCode !== null">（代码 {{ stanzaStatusCode }}）</span>。</p>
          </div>
        </details>

        <details class="collapse collapse-arrow border border-base-300 bg-base-100">
          <summary class="collapse-title font-semibold">4. 全量、差异和增量怎样选择？</summary>
          <div class="collapse-content space-y-3 text-sm text-base-content/75">
            <div class="grid gap-3 md:grid-cols-3">
              <div class="rounded-box bg-base-200 p-3"><div class="font-semibold text-primary">全量 full</div><p class="mt-1">完整读取集群并建立新基线。用于首次部署、仓库重建、重大数据迁移或 PostgreSQL 大版本切换后。</p></div>
              <div class="rounded-box bg-base-200 p-3"><div class="font-semibold text-secondary">差异 diff</div><p class="mt-1">保存相对最近全量的变化。适合日常备份和希望缩短恢复链路的场景。</p></div>
              <div class="rounded-box bg-base-200 p-3"><div class="font-semibold text-accent">增量 incr</div><p class="mt-1">保存相对最近一次备份的变化。适合发布前和较短备份周期，单次开销较小但恢复链更长。</p></div>
            </div>
            <ol class="list-decimal space-y-2 pl-5">
              <li>点击“立即备份”，按场景选择类型。</li>
              <li>备注填写发布版本、工单号或变更原因，避免只写“测试”。</li>
              <li>提交后等待任务由“等待执行”进入“执行中”，不要重复点击。</li>
              <li>任务成功后刷新，确认备份集出现新标签和合理的完成时间。</li>
              <li>任务失败时打开日志，先查看 stderr 最后部分，再检查服务器 pgBackRest 日志。</li>
            </ol>
          </div>
        </details>

        <details class="collapse collapse-arrow border border-base-300 bg-base-100">
          <summary class="collapse-title font-semibold">5. “运行检查”会做什么？</summary>
          <div class="collapse-content space-y-2 text-sm text-base-content/75">
            <p>检查任务不会创建备份。它会核对 stanza、数据目录、数据库身份、归档配置，并通过 WAL 切换确认归档文件能到达仓库。</p>
            <p>首次部署、修改 PostgreSQL/pgBackRest 配置、更换仓库或凭据、调整网络策略、发现归档超时后都应运行检查。</p>
            <p>检查成功只代表当前链路正常，不能替代仓库校验和隔离恢复演练。</p>
          </div>
        </details>

        <details class="collapse collapse-arrow border border-base-300 bg-base-100">
          <summary class="collapse-title font-semibold">6. 定时任务在哪里运行？</summary>
          <div class="collapse-content space-y-3 text-sm text-base-content/75">
            <p>定时任务由数据库主机上的 systemd timer 直接运行，不依赖 Network Mapping Web 服务。页面当前只展示仓库结果，不在线修改 timer。</p>
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead><tr><th>任务</th><th>模板默认时间</th></tr></thead>
                <tbody>
                  <tr><td>全量</td><td>周日 02:10</td></tr>
                  <tr><td>差异</td><td>周一至周六 02:10</td></tr>
                  <tr><td>增量</td><td>每天 08:10、14:10、20:10</td></tr>
                  <tr><td>归档检查</td><td>每天 01:30</td></tr>
                </tbody>
              </table>
            </div>
            <pre class="overflow-x-auto rounded-box bg-neutral p-3 text-xs text-neutral-content"><code>systemctl list-timers 'pgbackrest-*'
systemctl status pgbackrest-backup-full.timer
journalctl -u pgbackrest-backup@full.service -n 100 --no-pager</code></pre>
            <p>systemd 任务不会出现在“手动任务”表，但成功后一定应在“备份集”中出现新标签。</p>
          </div>
        </details>

        <details class="collapse collapse-arrow border border-base-300 bg-base-100">
          <summary class="collapse-title font-semibold">7. 常见错误怎样处理？</summary>
          <div class="collapse-content space-y-3 text-sm text-base-content/75">
            <div class="space-y-2">
              <p><strong>管理功能未启用：</strong>确认服务实际使用的 config.toml 中 <code>[backup].enabled=true</code>，然后重启服务。</p>
              <p><strong>sudo 要求密码或拒绝：</strong>确认页面显示的执行方式为“sudo → postgres”，再用上一节的精确 info 命令以服务账户测试。检查 sudoers 中账户、路径、参数顺序、config 和 stanza 是否与服务配置完全一致。</p>
              <p><strong>pgBackRest 权限错误：</strong>如果 sudo 已通过但 pgBackRest 仍报错，再检查 postgres 对配置文件、数据目录、spool、日志和仓库的访问权限。</p>
              <p><strong>archive timeout：</strong>检查 PostgreSQL 实际 archive_mode/archive_command、数据库日志、archive-push 日志、spool 权限和对象存储网络。</p>
              <p><strong>HTTP 409：</strong>已有手动任务运行。等待结束并刷新，同时确认操作系统中没有其他 pgBackRest 或 systemd 任务。</p>
              <p><strong>长时间执行：</strong>查看任务日志、pgBackRest 文件日志和 systemd journal，确认仓库 I/O、数据库负载和网络；不要直接删除锁文件。</p>
              <p><strong>Web 日志被截断：</strong>页面日志受 max_output_bytes 限制，完整内容在 pgBackRest log-path 或 journal 中。</p>
            </div>
          </div>
        </details>

        <details class="collapse collapse-arrow border border-base-300 bg-base-100">
          <summary class="collapse-title font-semibold">8. 恢复和安全边界</summary>
          <div class="collapse-content space-y-2 text-sm text-base-content/75">
            <ul class="list-disc space-y-2 pl-5">
              <li>恢复只能在停止 PostgreSQL、目标数据目录为空且权限正确的隔离环境进行。</li>
              <li>指定时间点恢复必须包含明确时区，并确保备份和 WAL 覆盖目标时间。</li>
              <li>不要把恢复测试的 pg1-path、端口或应用配置指向生产环境。</li>
              <li>不要在 Git、页面、systemd unit 或任务备注中填写仓库密钥。</li>
              <li>不要通过放宽为 root 或授权任意 sudo 来修复权限问题。</li>
              <li>至少每季度恢复一次，并记录恢复时间点、业务校验结果和实际 RTO。</li>
            </ul>
            <a class="link link-primary inline-block" href="https://pgbackrest.org/user-guide.html" target="_blank" rel="noopener noreferrer">查看 pgBackRest 官方用户指南</a>
          </div>
        </details>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>关闭使用指南</button></form>
  </dialog>

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
        <div role="note" class="rounded-box border border-base-300 bg-base-200 p-3 text-sm text-base-content/70">
          {{ selectedBackupDescription }}
        </div>
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
