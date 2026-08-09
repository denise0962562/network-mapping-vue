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
  pending: { class: 'scan_wait', text: '待扫描' },
  running: { class: 'scan_open', text: '扫描中' },
  succeeded: { class: 'scan_success', text: '扫描完成' },
  failed: { class: 'scan_faild', text: '扫描失败' },
  cancelled: { class: 'scan_faild', text: '已取消' }
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

async function refreshWithCount() {
  if (isLoadingData.value) return
  countParam.value = selectedCount.value === '' ? null : Number(selectedCount.value)
  inferredPageSize.value = null
  lockedTotalCount.value = 0
  currentPage.value = 1
  pageStartHistory.value = [null]
  await fetchTasks({ count: countParam.value })
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

  <div class="flex justify-center">
    <div class="card bg-base-100 card-border m-2.5 border-base-300 w-[85%] p-5">
      <div class="flex flex-col space-y-3">
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <label class="form-control w-full">
            <span class="label-text mb-1">任务ID</span>
            <input v-model="draftFilters.taskId" type="text" class="input input-bordered w-full" placeholder="输入任务ID" :disabled="isLoadingData" />
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1">目标</span>
            <input v-model="draftFilters.target" type="text" class="input input-bordered w-full" placeholder="输入目标" :disabled="isLoadingData" />
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
            </select>
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1">操作者</span>
            <input v-model="draftFilters.operator" type="text" class="input input-bordered w-full" placeholder="输入操作者" :disabled="isLoadingData" />
          </label>

          <div class="flex items-end">
            <button class="btn rounded-lg btn-neutral w-full" :disabled="isLoadingData" @click="applySearch">搜索</button>
          </div>

          <div class="flex items-end">
            <button class="btn rounded-lg btn-ghost w-full border border-base-300" :disabled="isLoadingData" @click="resetFilters">重置条件</button>
          </div>
        </div>

        <details class="collapse bg-base-100 border border-base-300">
          <summary class="collapse-title font-semibold">高级筛选</summary>
          <div class="collapse-content">
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 pt-1">
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
                <span class="label-text mb-1">每页条目（可选）</span>
                <select v-model="selectedCount" class="select select-bordered w-full" :disabled="isLoadingData" @change="refreshWithCount">
                  <option value="">默认</option>
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
              </label>

              <div class="flex items-end text-sm opacity-70">
                总任务数 {{ lockedTotalCount }}，本页返回 {{ itemCount }}，筛选后 {{ filteredTaskItems.length }}
              </div>
            </div>
          </div>
        </details>

        <div class="card bg-base-100 border border-base-300">
          <div v-if="isLoadingData" class="p-5 space-y-3">
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
              type="info"
              title="没有数据"
              message="这并非错误，而是没能从数据库或存储介质中找到符合要求的数据"
            />

            <div v-else class="overflow-x-auto">
              <table class="table table-fixed w-full">
                <thead>
                  <tr>
                    <th class="w-8"></th>
                    <th class="w-40">任务ID</th>
                    <th class="w-28">扫描器</th>
                    <th class="w-56">目标</th>
                    <th class="w-24">端口</th>
                    <th class="w-24">操作者</th>
                    <th class="w-24">状态</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-if="filteredTaskItems.length > 0">
                    <template v-for="(taskItem, index) in filteredTaskItems" :key="taskItem.taskId">
                      <tr class="hover:bg-base-300 cursor-pointer" @click="toggleRow(taskItem.taskId)">
                        <td class="w-8">{{ (currentPage - 1) * effectivePageSize + index + 1 }}</td>
                        <td class="w-40 truncate">
                          <router-link class="link" :to="`/task/${taskItem.taskId}`" @click.stop>
                            {{ taskItem.taskId }}
                          </router-link>
                        </td>
                        <td class="w-28 truncate">{{ taskItem.scannerId }}</td>
                        <td class="w-56 truncate">{{ taskItem.target }}</td>
                        <td class="w-24 truncate">{{ taskItem.port }}</td>
                        <td class="w-24 truncate">{{ taskItem.operator }}</td>
                        <td class="w-24">
                          <span class="scan_status w-full" :class="stateConfig[taskItem.statusKey].class">
                            {{ stateConfig[taskItem.statusKey].text }}
                          </span>
                        </td>
                      </tr>
                      <tr v-if="expandedRow === taskItem.taskId">
                        <td class="w-10"></td>
                        <td colspan="6" class="w-full text-sm">
                          备注：{{ taskItem.remark }} | 创建时间：{{ taskItem.createTime }} | 领取次数：{{ taskItem.attemptCount }}
                          <span v-if="taskItem.failureReason" class="text-error"> | 失败原因：{{ taskItem.failureReason }}</span>
                        </td>
                      </tr>
                    </template>
                  </template>
                  <tr v-else-if="isFilteredEmpty">
                    <td colspan="7" class="text-center py-8 opacity-60">暂无符合条件的数据</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="!initialLoadFailed && !isServerEmpty" class="flex items-center justify-between mt-2 p-3">
              <div class="text-sm opacity-70">
                第 {{ currentPage }} 页，本页 {{ itemCount }} 条，筛选后 {{ filteredTaskItems.length }} 条，总数 {{ lockedTotalCount }}
              </div>
              <div class="join">
                <button class="join-item btn btn-sm" :disabled="!hasPrevPage || isLoadingData" @click="toPrevPage">上一页</button>
                <button class="join-item btn btn-sm btn-disabled">第 {{ currentPage }} / {{ totalPages }} 页</button>
                <button class="join-item btn btn-sm" :disabled="!hasNextPage || isLoadingData" @click="toNextPage">下一页</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
