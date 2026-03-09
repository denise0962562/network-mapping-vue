<script setup>
import { computed, ref, watch } from 'vue'

const expandedRow = ref(null)
const currentPage = ref(1)

function getDefaultFilters() {
  return {
    taskId: '',
    target: '',
    status: '',
    operator: '',
    startTime: '',
    endTime: '',
    scannerId: '',
    pageSize: 5
  }
}

const draftFilters = ref(getDefaultFilters())
const appliedFilters = ref(getDefaultFilters())

const taskItems = ref([
  {
    taskId: 'sdcdsa',
    scannerId: 'scanner-01',
    target: '221.233.151.58/24',
    operator: 'System',
    startTime: '2026-03-08T10:20:00',
    status: 0,
    remark: 'test remark'
  },
  {
    taskId: 'sdcdsb',
    scannerId: 'scanner-01',
    target: '47.122.119.248/24,212.59.218.33/24',
    operator: 'Admin',
    startTime: '2026-03-08T15:30:00',
    status: 1,
    remark: 'scanner-01 Admin remark'
  },
  {
    taskId: 'sdcdsc',
    scannerId: 'scanner-02',
    target: '10.0.0.0/24',
    operator: 'Alice',
    startTime: '2026-03-09T09:00:00',
    status: 2,
    remark: 'waiting for scanner'
  },
  {
    taskId: 'sdcdsd',
    scannerId: 'scanner-03',
    target: '172.16.12.1',
    operator: 'Bob',
    startTime: '2026-03-09T11:00:00',
    status: 3,
    remark: 'connection timeout'
  },
  {
    taskId: 'sdcdse',
    scannerId: 'scanner-02',
    target: '8.8.8.8',
    operator: 'System',
    startTime: '2026-03-09T12:30:00',
    status: 1,
    remark: 'finished successfully'
  },
  {
    taskId: 'sdcdsf',
    scannerId: 'scanner-04',
    target: '192.168.2.0/24',
    operator: 'Admin',
    startTime: '2026-03-09T13:20:00',
    status: 0,
    remark: 'running'
  },
  {
    taskId: 'sdcdsg',
    scannerId: 'scanner-05',
    target: '43.132.11.22',
    operator: 'Cathy',
    startTime: '2026-03-09T14:05:00',
    status: 1,
    remark: 'done'
  }
])

const stateConfig = {
  0: { class: 'scan_open', text: '扫描中' },
  1: { class: 'scan_success', text: '成功' },
  2: { class: 'scan_wait', text: '等待' },
  3: { class: 'scan_faild', text: '错误' }
}

const scannerOptions = computed(() => {
  const scanners = taskItems.value.map((item) => item.scannerId)
  return [...new Set(scanners)]
})

const filteredTaskItems = computed(() => {
  return taskItems.value.filter((item) => {
    const matchTaskId = item.taskId.toLowerCase().includes(appliedFilters.value.taskId.trim().toLowerCase())
    const matchTarget = item.target.toLowerCase().includes(appliedFilters.value.target.trim().toLowerCase())
    const matchOperator = item.operator.toLowerCase().includes(appliedFilters.value.operator.trim().toLowerCase())
    const matchStatus = appliedFilters.value.status === '' || String(item.status) === String(appliedFilters.value.status)
    const matchScanner = appliedFilters.value.scannerId === '' || item.scannerId === appliedFilters.value.scannerId

    const itemTime = new Date(item.startTime).getTime()
    const startTime = appliedFilters.value.startTime ? new Date(appliedFilters.value.startTime).getTime() : null
    const endTime = appliedFilters.value.endTime ? new Date(appliedFilters.value.endTime).getTime() : null

    const matchStart = startTime === null || itemTime >= startTime
    const matchEnd = endTime === null || itemTime <= endTime

    return matchTaskId && matchTarget && matchOperator && matchStatus && matchScanner && matchStart && matchEnd
  })
})

const totalPages = computed(() => {
  const pages = Math.ceil(filteredTaskItems.value.length / Number(appliedFilters.value.pageSize))
  return pages > 0 ? pages : 1
})

const pagedTaskItems = computed(() => {
  const start = (currentPage.value - 1) * Number(appliedFilters.value.pageSize)
  const end = start + Number(appliedFilters.value.pageSize)
  return filteredTaskItems.value.slice(start, end)
})

const pageNumbers = computed(() => {
  return Array.from({ length: totalPages.value }, (_, index) => index + 1)
})

watch(filteredTaskItems, () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = totalPages.value
  }
})

function applySearch() {
  appliedFilters.value = { ...draftFilters.value }
  currentPage.value = 1
  expandedRow.value = null
}

function toggleRow(taskId) {
  expandedRow.value = expandedRow.value === taskId ? null : taskId
}

function resetFilters() {
  const defaults = getDefaultFilters()
  draftFilters.value = { ...defaults }
  appliedFilters.value = { ...defaults }
  currentPage.value = 1
  expandedRow.value = null
}

function formatTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function changePage(page) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  expandedRow.value = null
}
</script>

<template>
  <div class="flex justify-center">
    <div class="card bg-base-100 card-border m-2.5 border-base-300 w-[85%] p-5">
      <div class="flex flex-col space-y-3">
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <label class="form-control w-full">
            <span class="label-text mb-1">任务ID</span>
            <input v-model="draftFilters.taskId" type="text" class="input input-bordered w-full" placeholder="输入任务ID" />
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1">目标</span>
            <input v-model="draftFilters.target" type="text" class="input input-bordered w-full" placeholder="输入目标" />
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1">状态</span>
            <select v-model="draftFilters.status" class="select select-bordered w-full">
              <option value="">全部</option>
              <option value="0">扫描中</option>
              <option value="1">成功</option>
              <option value="2">等待</option>
              <option value="3">错误</option>
            </select>
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1">操作者</span>
            <input v-model="draftFilters.operator" type="text" class="input input-bordered w-full" placeholder="输入操作者" />
          </label>

          <div class="flex items-end">
            <button class="btn rounded-lg btn-primary w-full" @click="applySearch">搜索</button>
          </div>

          <div class="flex items-end">
            <button class="btn rounded-lg btn-ghost w-full border border-base-300" @click="resetFilters">重置条件</button>
          </div>
        </div>

        <details class="collapse bg-base-100 border border-base-300">
          <summary class="collapse-title font-semibold">高级筛选</summary>
          <div class="collapse-content">
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 pt-1">
              <label class="form-control w-full">
                <span class="label-text mb-1">开始时间</span>
                <input v-model="draftFilters.startTime" type="datetime-local" class="input input-bordered w-full" />
              </label>

              <label class="form-control w-full">
                <span class="label-text mb-1">结束时间</span>
                <input v-model="draftFilters.endTime" type="datetime-local" class="input input-bordered w-full" />
              </label>

              <label class="form-control w-full">
                <span class="label-text mb-1">扫描器</span>
                <select v-model="draftFilters.scannerId" class="select select-bordered w-full">
                  <option value="">全部</option>
                  <option v-for="scanner in scannerOptions" :key="scanner" :value="scanner">{{ scanner }}</option>
                </select>
              </label>

              <label class="form-control w-full">
                <span class="label-text mb-1">每页条目</span>
                <select v-model.number="draftFilters.pageSize" class="select select-bordered w-full">
                  <option :value="5">5</option>
                  <option :value="10">10</option>
                  <option :value="20">20</option>
                  <option :value="50">50</option>
                </select>
              </label>

              <div class="flex items-end text-sm opacity-70">共 {{ filteredTaskItems.length }} 条</div>
            </div>
          </div>
        </details>

        <div class="overflow-x-auto">
          <table class="table table-fixed w-full">
            <thead>
              <tr>
                <th class="w-10"></th>
                <th class="w-24">任务ID</th>
                <th class="w-24">扫描器</th>
                <th class="w-44">目标</th>
                <th class="w-24">操作者</th>
                <th class="w-32">开始时间</th>
                <th class="w-24">状态</th>
              </tr>
            </thead>
            <tbody>
              <template v-if="pagedTaskItems.length > 0">
                <template v-for="(taskItem, index) in pagedTaskItems" :key="taskItem.taskId">
                  <tr class="hover:bg-base-300 cursor-pointer" @click="toggleRow(taskItem.taskId)">
                    <td class="w-10">{{ (currentPage - 1) * appliedFilters.pageSize + index + 1 }}</td>
                    <td class="w-24 truncate">{{ taskItem.taskId }}</td>
                    <td class="w-24 truncate">{{ taskItem.scannerId }}</td>
                    <td class="w-44 truncate">{{ taskItem.target }}</td>
                    <td class="w-24 truncate">{{ taskItem.operator }}</td>
                    <td class="w-32 text-xs">{{ formatTime(taskItem.startTime) }}</td>
                    <td class="w-24">
                      <span class="scan_status w-full" :class="stateConfig[taskItem.status].class">
                        {{ stateConfig[taskItem.status].text }}
                      </span>
                    </td>
                  </tr>
                  <tr v-if="expandedRow === taskItem.taskId">
                    <td class="w-10"></td>
                    <td colspan="6" class="w-full text-sm">{{ taskItem.remark }}</td>
                  </tr>
                </template>
              </template>
              <tr v-else>
                <td colspan="7" class="text-center py-8 opacity-60">暂无符合条件的数据</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-between mt-2">
          <div class="text-sm opacity-70">第 {{ currentPage }} / {{ totalPages }} 页</div>
          <div class="join">
            <button class="join-item btn btn-sm" :disabled="currentPage === 1" @click="changePage(currentPage - 1)">上一页</button>
            <button
              v-for="page in pageNumbers"
              :key="page"
              class="join-item btn btn-sm"
              :class="{ 'btn-active': currentPage === page }"
              @click="changePage(page)"
            >
              {{ page }}
            </button>
            <button class="join-item btn btn-sm" :disabled="currentPage === totalPages" @click="changePage(currentPage + 1)">下一页</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
