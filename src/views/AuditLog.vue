<script setup>
import { computed, onMounted, ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import http from '@/utils/http'

const events = ref([])
const loading = ref(false)
const exporting = ref(false)
const errorMessage = ref('')
const selectedEvent = ref(null)
const page = ref(1)
const pageSize = 25
const total = ref(0)

const filters = ref({
  keyword: '',
  category: '',
  outcome: '',
  start: '',
  end: ''
})

const categoryLabels = {
  authentication: '身份认证',
  authorization: '权限控制',
  user_security: '用户安全',
  task: '扫描任务',
  scanner: '扫描器',
  configuration: '系统配置',
  data_access: '数据访问',
  audit: '审计系统'
}

const actionLabels = {
  'auth.login': '用户登录',
  'auth.password_verify': '密码验证',
  'auth.logout': '退出登录',
  'auth.totp_verify': '双因素验证',
  'user.password_change': '修改密码',
  'user.totp_bind': '绑定双因素认证',
  'user.totp_unbind': '解绑双因素认证',
  'task.create': '创建任务',
  'task.cancel': '取消任务',
  'task.retry': '重试任务',
  'scanner.create': '创建扫描器',
  'scanner.register': '注册扫描器',
  'scanner.update': '更新扫描器',
  'scanner.enable': '启用扫描器',
  'scanner.disable': '禁用扫描器',
  'scanner.token.reissue': '重发扫描器令牌',
  'scanner.delete': '删除扫描器',
  'audit.query': '查询审计日志',
  'audit.export': '导出审计日志'
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

function formatTime(value) {
  if (!value) return '--'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function resultClass(outcome) {
  if (outcome === 'success') return 'badge-success'
  if (outcome === 'denied') return 'badge-warning'
  return 'badge-error'
}

function resultLabel(outcome) {
  return { success: '成功', failure: '失败', denied: '拒绝' }[outcome] || outcome
}

function actorLabel(event) {
  if (event.actor_name) return event.actor_name
  if (event.actor_id) return `${event.actor_type}:${event.actor_id}`
  return event.actor_type === 'anonymous' ? '匿名访问' : event.actor_type
}

function resourceLabel(event) {
  if (!event.resource_type && !event.resource_id) return '--'
  return [event.resource_type, event.resource_id].filter(Boolean).join(' / ')
}

function buildParams(includePagination = true) {
  const params = {}
  for (const key of ['keyword', 'category', 'outcome']) {
    if (filters.value[key]) params[key] = filters.value[key]
  }
  if (filters.value.start) params.start = new Date(filters.value.start).toISOString()
  if (filters.value.end) params.end = new Date(filters.value.end).toISOString()
  if (includePagination) {
    params.page = page.value
    params.page_size = pageSize
  }
  return params
}

async function loadEvents() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await http.get('/api/audit/events', { params: buildParams() })
    events.value = response.data?.items || []
    total.value = Number(response.data?.pagination?.total) || 0
  } catch (error) {
    if (error.response?.status === 403) {
      errorMessage.value = '只有管理员可以查看审计日志。'
    } else {
      errorMessage.value = '审计日志加载失败，请稍后重试。'
    }
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  loadEvents()
}

function resetFilters() {
  filters.value = { keyword: '', category: '', outcome: '', start: '', end: '' }
  page.value = 1
  loadEvents()
}

function changePage(nextPage) {
  if (nextPage < 1 || nextPage > totalPages.value || nextPage === page.value) return
  page.value = nextPage
  loadEvents()
}

async function exportCsv() {
  exporting.value = true
  errorMessage.value = ''
  try {
    const response = await http.get('/api/audit/export', {
      params: buildParams(false),
      responseType: 'blob'
    })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `network-mapping-audit-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    errorMessage.value = error.response?.status === 403
      ? '只有管理员可以导出审计日志。'
      : '审计日志导出失败，请稍后重试。'
  } finally {
    exporting.value = false
  }
}

function formattedJson(value) {
  if (!value || (typeof value === 'object' && Object.keys(value).length === 0)) return '--'
  return JSON.stringify(value, null, 2)
}

onMounted(loadEvents)
</script>

<template>
  <main class="p-4 md:p-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">审计日志</h1>
        <p class="mt-1 text-sm text-base-content/60">追踪关键身份认证、任务和扫描器管理操作。</p>
      </div>
      <button class="btn btn-outline btn-sm" :disabled="exporting || loading" @click="exportCsv">
        {{ exporting ? '导出中…' : '导出 CSV' }}
      </button>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body gap-4 p-4">
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input v-model.trim="filters.keyword" class="input input-bordered w-full xl:col-span-2" placeholder="动作、操作者或资源 ID" @keyup.enter="applyFilters" />
          <select v-model="filters.category" class="select select-bordered w-full">
            <option value="">全部分类</option>
            <option v-for="(label, value) in categoryLabels" :key="value" :value="value">{{ label }}</option>
          </select>
          <select v-model="filters.outcome" class="select select-bordered w-full">
            <option value="">全部结果</option>
            <option value="success">成功</option>
            <option value="failure">失败</option>
            <option value="denied">拒绝</option>
          </select>
          <input v-model="filters.start" type="datetime-local" class="input input-bordered w-full" aria-label="开始时间" />
          <input v-model="filters.end" type="datetime-local" class="input input-bordered w-full" aria-label="结束时间" />
        </div>
        <div class="flex justify-end gap-2">
          <button class="btn btn-ghost btn-sm" :disabled="loading" @click="resetFilters">重置</button>
          <button class="btn btn-neutral btn-sm" :disabled="loading" @click="applyFilters">查询</button>
        </div>
      </div>
    </div>

    <div v-if="errorMessage" class="alert alert-error mt-4" role="alert">
      <span>{{ errorMessage }}</span>
      <button class="btn btn-ghost btn-xs" @click="loadEvents">重试</button>
    </div>

    <div class="mt-4 overflow-hidden rounded-box border border-base-300 bg-base-100">
      <div v-if="loading" class="flex min-h-64 items-center justify-center">
        <span class="loading loading-spinner loading-lg"></span>
      </div>
      <EmptyState v-else-if="!errorMessage && events.length === 0" title="暂无审计事件" message="当前筛选条件下没有可显示的记录。" />
      <div v-else-if="events.length" class="overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>时间</th>
              <th>操作者</th>
              <th>动作</th>
              <th>资源</th>
              <th>来源 IP</th>
              <th>结果</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="event in events" :key="event.event_id">
              <td class="whitespace-nowrap text-xs">{{ formatTime(event.occurred_at) }}</td>
              <td>{{ actorLabel(event) }}</td>
              <td>
                <div class="font-medium">{{ actionLabels[event.action] || event.action }}</div>
                <div class="text-xs text-base-content/50">{{ categoryLabels[event.category] || event.category }}</div>
              </td>
              <td class="max-w-64 truncate" :title="resourceLabel(event)">{{ resourceLabel(event) }}</td>
              <td class="font-mono text-xs">{{ event.source_ip || '--' }}</td>
              <td><span class="badge badge-sm" :class="resultClass(event.outcome)">{{ resultLabel(event.outcome) }}</span></td>
              <td><button class="btn btn-ghost btn-xs" @click="selectedEvent = event">详情</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="events.length" class="mt-4 flex items-center justify-between text-sm">
      <span class="text-base-content/60">共 {{ total }} 条，第 {{ page }} / {{ totalPages }} 页</span>
      <div class="join">
        <button class="btn btn-sm join-item" :disabled="page <= 1 || loading" @click="changePage(page - 1)">上一页</button>
        <button class="btn btn-sm join-item" :disabled="page >= totalPages || loading" @click="changePage(page + 1)">下一页</button>
      </div>
    </div>

    <dialog class="modal" :class="{ 'modal-open': selectedEvent }">
      <div v-if="selectedEvent" class="modal-box max-w-3xl">
        <h2 class="text-lg font-semibold">审计事件详情</h2>
        <div class="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div><span class="text-base-content/50">事件 ID</span><div class="break-all font-mono text-xs">{{ selectedEvent.event_id }}</div></div>
          <div><span class="text-base-content/50">请求 ID</span><div class="break-all font-mono text-xs">{{ selectedEvent.request_id || '--' }}</div></div>
          <div><span class="text-base-content/50">时间</span><div>{{ formatTime(selectedEvent.occurred_at) }}</div></div>
          <div><span class="text-base-content/50">响应状态</span><div>{{ selectedEvent.response_status || '--' }}</div></div>
          <div><span class="text-base-content/50">请求</span><div>{{ selectedEvent.http_method || '--' }} {{ selectedEvent.request_path || '--' }}</div></div>
          <div><span class="text-base-content/50">User-Agent</span><div class="break-all">{{ selectedEvent.user_agent || '--' }}</div></div>
        </div>
        <div class="mt-4">
          <div class="text-sm text-base-content/50">变更内容</div>
          <pre class="mt-1 max-h-52 overflow-auto rounded-box bg-base-200 p-3 text-xs">{{ formattedJson(selectedEvent.changes) }}</pre>
        </div>
        <div class="mt-4">
          <div class="text-sm text-base-content/50">元数据</div>
          <pre class="mt-1 max-h-52 overflow-auto rounded-box bg-base-200 p-3 text-xs">{{ formattedJson(selectedEvent.metadata) }}</pre>
        </div>
        <div class="modal-action"><button class="btn" @click="selectedEvent = null">关闭</button></div>
      </div>
      <button class="modal-backdrop" aria-label="关闭详情" @click="selectedEvent = null"></button>
    </dialog>
  </main>
</template>
