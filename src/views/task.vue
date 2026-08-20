<script setup>
import { computed, onMounted, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import http from '@/utils/http'

const alerts = ref([])
const expandedRow = ref(null)
const currentPage = ref(1)
const isLoadingData = ref(false)
const initialLoadFailed = ref(false)
const hasLoadedTasks = ref(false)
const selectedCount = ref('')
const includeSystemTasks = ref(false)
function getDefaultFilters() {
  return {
    taskId: '',
    target: '',
    status: '',
    operator: '',
    startTime: '',
    endTime: '',
    scannerId: ''
  }
}

const draftFilters = ref(getDefaultFilters())
const appliedFilters = ref(getDefaultFilters())

const taskItems = ref([])
const totalCount = ref(0)
const lockedTotalCount = ref(0)
const itemCount = ref(0)
const startId = ref(null)
const countParam = ref(null)
const pageStartHistory = ref([null])
const inferredPageSize = ref(null)

const stateConfig = {
  pending: { class: 'badge-warning', text: '待扫描' },
  running: { class: 'badge-info', text: '扫描中' },
  succeeded: { class: 'badge-success', text: '扫描完成' },
  failed: { class: 'badge-error', text: '扫描失败' },
  cancelled: { class: 'badge-ghost', text: '已取消' },
  partial: { class: 'badge-warning', text: '部分完成' }
}

function formatUnixMs(value) {
  if (value === null || value === undefined) return '-'
  const date = new Date(Number(value))
  if (Number.isNaN(date.getTime())) return '-'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

function resolveStatus(status) {
  return stateConfig[status] ? status : 'pending'
}

function normalizeTask(item) {
  const targets = Array.isArray(item.task_target) ? item.task_target.join(', ') : '-'
  const createTimeMs = Number(item.task_create_time)
  return {
    taskId: item.task_id || '-',
    scannerId: item.scanner_id || '-',
    target: targets,
    addressFamily: item.address_family === 'ipv6' ? 'IPv6' : 'IPv4',
    port: item.task_port || '-',
    operator: item.task_initiator || '-',
    createTimeMs: Number.isFinite(createTimeMs) ? createTimeMs : null,
    createTime: formatUnixMs(item.task_create_time),
    statusKey: resolveStatus(item.task_status),
    remark: item.remarks || '-',
    attemptCount: Number(item.attempt_count) || 0,
    failureReason: item.failure_reason || ''
  }
}

const scannerOptions = computed(() => {
  return [...new Set(taskItems.value.map((item) => item.scannerId).filter((id) => id !== '-'))]
})

const filteredTaskItems = computed(() => {
  return taskItems.value.filter((item) => {
    const matchTaskId = item.taskId.toLowerCase().includes(appliedFilters.value.taskId.trim().toLowerCase())
    const matchTarget = item.target.toLowerCase().includes(appliedFilters.value.target.trim().toLowerCase())
    const matchOperator = item.operator.toLowerCase().includes(appliedFilters.value.operator.trim().toLowerCase())
    const matchStatus = appliedFilters.value.status === '' || item.statusKey === appliedFilters.value.status
    const matchScanner = appliedFilters.value.scannerId === '' || item.scannerId === appliedFilters.value.scannerId

    const startTime = appliedFilters.value.startTime ? new Date(appliedFilters.value.startTime).getTime() : null
    const endTime = appliedFilters.value.endTime ? new Date(appliedFilters.value.endTime).getTime() : null
    const matchStart = startTime === null || (item.createTimeMs !== null && item.createTimeMs >= startTime)
    const matchEnd = endTime === null || (item.createTimeMs !== null && item.createTimeMs <= endTime)

    return matchTaskId && matchTarget && matchOperator && matchStatus && matchScanner && matchStart && matchEnd
  })
})

const isServerEmpty = computed(() => {
  return !initialLoadFailed.value && hasLoadedTasks.value && taskItems.value.length === 0
})

const isFilteredEmpty = computed(() => {
  return !initialLoadFailed.value && !isServerEmpty.value && filteredTaskItems.value.length === 0
})

const nextStart = computed(() => {
  if (typeof startId.value !== 'number' || typeof itemCount.value !== 'number') return null
  const candidate = startId.value - itemCount.value
  if (!Number.isFinite(candidate) || candidate < 0) return null
  return candidate
})

const effectivePageSize = computed(() => {
  if (typeof countParam.value === 'number' && countParam.value > 0) return countParam.value
  if (typeof inferredPageSize.value === 'number' && inferredPageSize.value > 0) return inferredPageSize.value
  if (typeof itemCount.value === 'number' && itemCount.value > 0) return itemCount.value
  return 1
})

const totalPages = computed(() => {
  const pages = Math.ceil(lockedTotalCount.value / effectivePageSize.value)
  return pages > 0 ? pages : 1
})

const hasPrevPage = computed(() => currentPage.value > 1)
const hasNextPage = computed(() => {
  if (currentPage.value >= totalPages.value) return false
  if (nextStart.value === null) return false
  return true
})

function pushAlert(type, title, description = '', timeout = 7000) {
  alerts.value.unshift({
    id: crypto.randomUUID(),
    type,
    title,
    description,
    timeout
  })
}

function closeAlert(id) {
  alerts.value = alerts.value.filter((alert) => alert.id !== id)
}

async function fetchTasks({ start, count } = {}) {
  try {
    isLoadingData.value = true

    const params = {}
    if (typeof start === 'number') params.start = start
    if (typeof count === 'number') params.count = count
    if (includeSystemTasks.value) params.include_system = true

    const response = await http.get('/api/task/all', {
      params: Object.keys(params).length > 0 ? params : undefined
    })

    const data = response?.data || {}
    totalCount.value = Number(data.total_c) || 0
    if (typeof start !== 'number') {
      lockedTotalCount.value = totalCount.value
    } else if (lockedTotalCount.value === 0 && totalCount.value > 0) {
      lockedTotalCount.value = totalCount.value
    }
    itemCount.value = Number(data.item_c) || 0
    startId.value = typeof data.start_id === 'number' ? data.start_id : null
    if (typeof count === 'number' && count > 0) {
      inferredPageSize.value = count
    } else if (inferredPageSize.value === null && itemCount.value > 0) {
      inferredPageSize.value = itemCount.value
    }
    taskItems.value = Array.isArray(data.task_item) ? data.task_item.map(normalizeTask) : []
    initialLoadFailed.value = false
    hasLoadedTasks.value = true
    expandedRow.value = null
    return true
  } catch (error) {
    console.error('fetch tasks failed', error)
    if (!hasLoadedTasks.value) {
      taskItems.value = []
      totalCount.value = 0
      itemCount.value = 0
      startId.value = null
      initialLoadFailed.value = true
    }
    pushAlert('error', '任务数据加载失败', '请检查网络连接或服务器运行状态。', 7000)
    return false
  } finally {
    isLoadingData.value = false
  }
}

async function toNextPage() {
  if (isLoadingData.value || !hasNextPage.value) return
  const start = nextStart.value
  const ok = await fetchTasks({ start, count: countParam.value })
  if (!ok) return
  if (itemCount.value <= 0) return
  currentPage.value += 1
  pageStartHistory.value[currentPage.value - 1] = start
}

async function toPrevPage() {
  if (isLoadingData.value || !hasPrevPage.value) return
  const prevPage = currentPage.value - 1
  const start = pageStartHistory.value[prevPage - 1]
  const ok = await fetchTasks({ start: typeof start === 'number' ? start : undefined, count: countParam.value })
  if (!ok) return
  currentPage.value = prevPage
}

function resetPagination() {
  inferredPageSize.value = null
  lockedTotalCount.value = 0
  currentPage.value = 1
  pageStartHistory.value = [null]
}

async function reloadFromFirstPage() {
  resetPagination()
  await fetchTasks({ count: countParam.value })
}

async function refreshWithCount() {
  if (isLoadingData.value) return
  countParam.value = selectedCount.value === '' ? null : Number(selectedCount.value)
  await reloadFromFirstPage()
}

async function refreshSystemTaskVisibility() {
  if (isLoadingData.value) return
  await reloadFromFirstPage()
}

function applySearch() {
  if (isLoadingData.value) return
  appliedFilters.value = { ...draftFilters.value }
  expandedRow.value = null
}

function resetFilters() {
  if (isLoadingData.value) return
  const defaults = getDefaultFilters()
  draftFilters.value = { ...defaults }
  appliedFilters.value = { ...defaults }
  expandedRow.value = null
}

function toggleRow(taskId) {
  if (isLoadingData.value) return
  expandedRow.value = expandedRow.value === taskId ? null : taskId
}

onMounted(async () => {
  await fetchTasks()
})
</script>

<template>
  <div class="pointer-events-none fixed top-20 left-1/2 z-50 flex w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2 sm:left-auto sm:right-5 sm:w-auto sm:translate-x-0 sm:items-end">
    <AppAlert
      v-for="alert in alerts"
      :key="alert.id"
      class="pointer-events-auto"
      :type="alert.type"
      :title="alert.title"
      :description="alert.description"
      :timeout="alert.timeout"
      @close="closeAlert(alert.id)"
    />
  </div>

  <main class="p-4 md:p-6">
    <div class="mx-auto max-w-7xl space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold">任务</h1>
          <p class="mt-1 text-sm text-base-content/60">查看扫描任务、执行状态及调度信息。</p>
        </div>
        <button class="btn btn-outline btn-sm" :disabled="isLoadingData" @click="reloadFromFirstPage">
          <span v-if="isLoadingData" class="loading loading-spinner loading-xs"></span>
          {{ isLoadingData ? '刷新中…' : '刷新' }}
        </button>
      </div>

      <section class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body gap-4 p-4">
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label class="form-control w-full">
            <span class="label-text mb-1">任务 ID</span>
            <input v-model="draftFilters.taskId" type="text" class="input input-bordered w-full" placeholder="输入任务 ID" :disabled="isLoadingData" @keyup.enter="applySearch" />
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1">目标</span>
            <input v-model="draftFilters.target" type="text" class="input input-bordered w-full" placeholder="IP 或网段" :disabled="isLoadingData" @keyup.enter="applySearch" />
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1">状态</span>
            <select v-model="draftFilters.status" class="select select-bordered w-full" :disabled="isLoadingData">
              <option value="">全部</option>
              <option value="pending">待扫描</option>
              <option value="running">扫描中</option>
              <option value="succeeded">扫描完成</option>
              <option value="failed">扫描失败</option>
              <option value="cancelled">已取消</option>
              <option value="partial">部分完成</option>
            </select>
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1">操作者</span>
            <input v-model="draftFilters.operator" type="text" class="input input-bordered w-full" placeholder="输入操作者" :disabled="isLoadingData" @keyup.enter="applySearch" />
          </label>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <label class="label cursor-pointer gap-2 py-0">
              <input
                v-model="includeSystemTasks"
                type="checkbox"
                class="checkbox checkbox-sm"
                :disabled="isLoadingData"
                @change="refreshSystemTaskVisibility"
              />
              <span class="label-text">显示系统任务</span>
            </label>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-sm" :disabled="isLoadingData" @click="resetFilters">重置</button>
              <button class="btn btn-neutral btn-sm" :disabled="isLoadingData" @click="applySearch">查询</button>
            </div>
          </div>

          <details class="collapse collapse-arrow border border-base-300 bg-base-100">
            <summary class="collapse-title min-h-0 py-3 text-sm font-semibold">高级筛选</summary>
            <div class="collapse-content">
              <div class="grid gap-3 pt-1 md:grid-cols-2 xl:grid-cols-4">
              <label class="form-control w-full">
                <span class="label-text mb-1">开始时间</span>
                <input v-model="draftFilters.startTime" type="datetime-local" class="input input-bordered w-full" :disabled="isLoadingData" />
              </label>

              <label class="form-control w-full">
                <span class="label-text mb-1">结束时间</span>
                <input v-model="draftFilters.endTime" type="datetime-local" class="input input-bordered w-full" :disabled="isLoadingData" />
              </label>

              <label class="form-control w-full">
                <span class="label-text mb-1">扫描器</span>
                <select v-model="draftFilters.scannerId" class="select select-bordered w-full" :disabled="isLoadingData">
                  <option value="">全部</option>
                  <option v-for="scanner in scannerOptions" :key="scanner" :value="scanner">{{ scanner }}</option>
                </select>
              </label>

              <label class="form-control w-full">
                <span class="label-text mb-1">每页数量</span>
                <select v-model="selectedCount" class="select select-bordered w-full" :disabled="isLoadingData" @change="refreshWithCount">
                  <option value="">默认</option>
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
              </label>
              </div>
              <p class="mt-3 text-xs text-base-content/60">
                总任务 {{ lockedTotalCount }} 条，本页加载 {{ itemCount }} 条，当前筛选显示 {{ filteredTaskItems.length }} 条
              </p>
            </div>
          </details>
        </div>
      </section>

      <section class="overflow-hidden rounded-box border border-base-300 bg-base-100">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 px-4 py-3">
          <div>
            <h2 class="font-semibold">任务列表</h2>
            <p class="mt-0.5 text-xs text-base-content/50">点击任务行可展开调度与失败信息</p>
          </div>
          <span class="text-sm text-base-content/60">共 {{ lockedTotalCount }} 条</span>
        </div>

          <div v-if="isLoadingData" class="space-y-3 p-5">
            <div class="skeleton h-72 w-full rounded-box"></div>
            <div class="skeleton h-4 w-52"></div>
          </div>

          <template v-else>
            <EmptyState
              v-if="initialLoadFailed"
              type="error"
              title="加载数据失败"
              :message="'这通常是由于客户端与服务器的网络不可达或服务器崩溃了\n请检查您的网络，并测试是否可以正常访问服务器，如果上述一切正常，请联系系统管理员'"
            />

            <EmptyState
              v-else-if="isServerEmpty"
              title="暂无任务"
              message="当前还没有可显示的扫描任务。"
            />

            <EmptyState
              v-else-if="isFilteredEmpty"
              title="没有匹配的任务"
              message="请调整筛选条件后重试。"
            />

            <div v-else class="overflow-x-auto">
              <table class="table table-zebra min-w-[1050px]">
                <thead>
                  <tr>
                    <th class="w-14">#</th>
                    <th>任务 ID</th>
                    <th>扫描器</th>
                    <th>目标</th>
                    <th>协议</th>
                    <th>端口</th>
                    <th>操作者</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                    <template v-for="(taskItem, index) in filteredTaskItems" :key="taskItem.taskId">
                      <tr class="cursor-pointer" :class="{ 'bg-base-200': expandedRow === taskItem.taskId }" @click="toggleRow(taskItem.taskId)">
                        <td class="text-xs text-base-content/50">{{ (currentPage - 1) * effectivePageSize + index + 1 }}</td>
                        <td class="max-w-48">
                          <router-link class="link block truncate font-mono text-xs" :to="`/task/${taskItem.taskId}`" :title="taskItem.taskId" @click.stop>
                            {{ taskItem.taskId }}
                          </router-link>
                        </td>
                        <td class="max-w-32 truncate font-mono text-xs" :title="taskItem.scannerId">{{ taskItem.scannerId }}</td>
                        <td class="max-w-60 truncate" :title="taskItem.target">{{ taskItem.target }}</td>
                        <td><span class="badge badge-outline badge-xs">{{ taskItem.addressFamily }}</span></td>
                        <td class="max-w-32 truncate font-mono text-xs" :title="taskItem.port">{{ taskItem.port }}</td>
                        <td class="max-w-32 truncate" :title="taskItem.operator">{{ taskItem.operator }}</td>
                        <td>
                          <span class="badge badge-sm whitespace-nowrap" :class="stateConfig[taskItem.statusKey].class">
                            {{ stateConfig[taskItem.statusKey].text }}
                          </span>
                        </td>
                      </tr>
                      <tr v-if="expandedRow === taskItem.taskId" class="bg-base-200/60">
                        <td></td>
                        <td colspan="7" class="p-4">
                          <dl class="grid gap-4 text-sm md:grid-cols-3">
                            <div><dt class="text-xs text-base-content/50">创建时间</dt><dd class="mt-1">{{ taskItem.createTime }}</dd></div>
                            <div><dt class="text-xs text-base-content/50">领取次数</dt><dd class="mt-1">{{ taskItem.attemptCount }}</dd></div>
                            <div><dt class="text-xs text-base-content/50">备注</dt><dd class="mt-1 break-words">{{ taskItem.remark }}</dd></div>
                            <div v-if="taskItem.failureReason" class="md:col-span-3">
                              <dt class="text-xs text-error/70">失败原因</dt>
                              <dd class="mt-1 break-words text-error">{{ taskItem.failureReason }}</dd>
                            </div>
                          </dl>
                        </td>
                      </tr>
                    </template>
                </tbody>
              </table>
            </div>

            <div v-if="!initialLoadFailed && !isServerEmpty && !isFilteredEmpty" class="flex flex-col gap-3 border-t border-base-300 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="text-sm text-base-content/60">
                本页 {{ itemCount }} 条，筛选后 {{ filteredTaskItems.length }} 条
              </div>
              <div class="join">
                <button class="join-item btn btn-sm" :disabled="!hasPrevPage || isLoadingData" @click="toPrevPage">上一页</button>
                <button class="join-item btn btn-sm btn-disabled">{{ currentPage }} / {{ totalPages }}</button>
                <button class="join-item btn btn-sm" :disabled="!hasNextPage || isLoadingData" @click="toNextPage">下一页</button>
              </div>
            </div>
          </template>
      </section>
    </div>
  </main>
</template>
