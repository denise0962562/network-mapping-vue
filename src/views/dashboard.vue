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

  <div class="grid grid-cols-1 xl:grid-cols-2 gap-5 p-5">
    <div class="card bg-base-100 card-border border-base-300 p-4">
      <div class="mb-3">
        <h3 class="font-semibold">服务器资源利用状态</h3>
        <p class="text-xs opacity-60">使用率 / 空闲率（100% 堆叠）</p>
      </div>
      <div v-if="isFirstLoad" class="skeleton h-64 w-full rounded-box"></div>
      <ApexChart v-else type="bar" height="320" :options="resourceChartOptions" :series="resourceChartSeries" />
    </div>

    <div class="card bg-base-100 card-border border-base-300 p-4">
      <div class="mb-3">
        <h3 class="font-semibold">最近 7 天扫描情况</h3>
        <p class="text-xs opacity-60">按扫描器统计</p>
      </div>
      <div v-if="isFirstLoad" class="skeleton h-64 w-full rounded-box"></div>
      <ApexChart v-else type="bar" height="320" :options="scanChartOptions" :series="scanChartSeries" />
    </div>
  </div>

  <div class="px-5">
    <ResourceHistoryChart @error="handleResourceHistoryError" />
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 p-5">
    <div v-for="item in overviewCards" :key="item.title" class="stats shadow border border-base-300 bg-base-100">
      <div class="stat">
        <div class="stat-title">{{ item.title }}</div>
        <div class="stat-value text-2xl" :class="item.class">{{ item.value }}</div>
        <div class="stat-desc">{{ item.description }}</div>
      </div>
    </div>
  </div>   
  <!-- 资源卡片结束 -->

  <!-- 系统信息及扫描日志卡片 -->
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-5 p-5">
    <div class="big_card">
      
      <!-- 系统信息列表 -->
      <div class="p-4 pb-2 text-xs opacity-60 tracking-wide">系统详细信息</div>

      <div v-if="isFirstLoad" class="skeleton h-36 w-full rounded-box"></div>

      <ul v-else class="list">
        <li class="list-row">
          <div>系统运行状态</div>

          <div class="list-col-grow flex items-center justify-end gap-2">
            <div aria-label="success" class="status status-success"></div>
            <span class="text-xs opacity-60">运行中 (Uptime: {{ uptime }})</span>
          </div>

        </li>

        <li class="list-row">
          <div>
            <div>网络接口信息</div>
          </div>
          <div class="list-col-grow flex flex-col gap-1 text-xs opacity-60">
            <div v-for="iface in networkInterfaces" :key="iface.name" class="flex justify-end gap-2">
              <span>{{ iface.name }}</span>
              <span>发送/接收: {{ iface.send }} / {{ iface.receive }}</span>
            </div>
            <div v-if="networkInterfaces.length === 0" class="flex justify-end gap-2">
              <span>暂无数据</span>
            </div>
          </div>

        </li>

      </ul>

    </div>
    <!-- 系统信息卡片结束 -->

    <!-- 当前任务卡片 -->
    <div class="big_card">
      <div v-if="isFirstLoad" class="skeleton h-56 w-full rounded-box"></div>

      <div v-else class="overflow-x-auto">
        <table class="table table-fixed min-w-[600px]">
          <!-- head -->
          <thead>
            <tr>
              <th class="w-8"></th>
              <th class="w-20">任务</th>
              <th class="w-24 truncate">扫描器</th>
              <th class="w-36 max-w-36">目标</th>
              <th class="w-20">发起人</th>
              <th class="w-24">状态</th>
              <th class="max-w-36">备注</th>
            </tr>
          </thead>
          <!-- tbody -->
          <tbody class="">
            <!-- row start -->
            <!-- <tr>
              <th class="w-10">1</th>
              <th>121212</th>
              <th class="w-28 truncate">sadfeadsf</th>
              <th class="w-36 truncate">221.233.151.58/24</th>
              <th>System</th>
              <th>Today</th>
              <th class="w-24"><span class="scan_status scan_faild">错误</span></th>
              <th></th>
            </tr> -->

            <transition-group name="tasktable">
              <tr v-for="(taskitem, index) in taskList" :key="taskitem.taskid" class="hover:bg-base-300">
                <td class="w-8">{{ index + 1}}</td>
                <td class="w-20 truncate">{{ taskitem.taskid }}</td>
                <td class="w-24 truncate">{{ taskitem.scannerId }}</td>
                <td class="w-36 max-w-36 truncate">{{ taskitem.target }}</td>
                <td class="w-20">{{ taskitem.operationPerson }}</td>
                <td class="w-24"><span class="scan_status w-full" :class="stateConfig[taskitem.status].class">{{ stateConfig[taskitem.status].text }}</span></td>
                <td class="max-w-36 truncate">{{ taskitem.remark }}</td>
              </tr>
            </transition-group>
          </tbody>

        </table>
      </div>

    </div>
    <!-- 当前任务卡片结束 -->

  </div>


</template>

<style scoped>
  .tasktable-enter-active,.tasktable-leave-active {
    transition: all 0.5s ease;
  }
  .tasktable-enter-form,.tasktable-leave-to {
    opacity: 0;
    transform: translateX(30px);
  }
</style>

<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import ResourceHistoryChart from '@/components/ResourceHistoryChart.vue'
import http from '@/utils/http'

const ApexChart = defineAsyncComponent(() => import('vue3-apexcharts'))

const alerts = ref([])

const systemData = ref(null)
const dashboardData = ref(null)
const systemDataErrorVisible = ref(false)
const isFirstLoad = ref(true)
let refreshTimer = null
let dashboardTimer = null

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

function handleResourceHistoryError(error) {
  pushAlert('error', error.title, error.description)
}

async function fetchSystemData() {
  try {
    const response = await http.get('/api/data/system-data')
    if (response.data) {
      systemData.value = response.data
      systemDataErrorVisible.value = false
      isFirstLoad.value = false
    }
  } catch (error) {
    console.error('fetch system data failed', error)
    if (!systemDataErrorVisible.value) {
      systemDataErrorVisible.value = true
      pushAlert('error', '系统数据获取失败', '已保留上一次可用数据。', 7000)
    }
  }
}

async function fetchDashboardData() {
  try {
    const response = await http.get('/api/dashboard/overview')
    if (response.data?.success === true) dashboardData.value = response.data.data
  } catch (error) {
    console.error('fetch dashboard data failed', error)
  }
}

const overviewCards = computed(() => {
  const tasks = dashboardData.value?.tasks || {}
  const finished = Number(tasks.succeeded || 0) + Number(tasks.failed || 0) + Number(tasks.cancelled || 0)
  const successRate = finished > 0 ? `${Math.round((Number(tasks.succeeded || 0) / finished) * 100)}%` : '0%'
  const averageSeconds = Math.round(Number(dashboardData.value?.avg_duration_ms || 0) / 1000)
  return [
    { title: '在线扫描器', value: dashboardData.value?.online_scanners ?? 0, description: '90 秒内存在心跳', class: 'text-success' },
    { title: '执行中任务', value: tasks.running ?? 0, description: `等待 ${tasks.pending ?? 0} 个`, class: 'text-info' },
    { title: '任务成功率', value: successRate, description: `已完成 ${finished} 个`, class: '' },
    { title: '平均耗时', value: `${averageSeconds} 秒`, description: '成功任务平均值', class: '' }
  ]
})

const resourceChartSeries = computed(() => {
  const status = systemData.value?.status_item?.[0]
  if (!status) {
    return [
      { name: '使用', data: [0, 0, 0] },
      { name: '空闲', data: [100, 100, 100] }
    ]
  }

  const cpuUsage = Number(((status.cpu?.cpu_usage ?? 0)).toFixed(2))
  const ramUsage = status.ram?.total_ram
    ? Number(((status.ram.used_ram / status.ram.total_ram) * 100).toFixed(2))
    : 0
  const diskUsage = status.disk?.disk_total_space
    ? Number(((status.disk.disk_total_usage / status.disk.disk_total_space) * 100).toFixed(2))
    : 0

  return [
    { name: '使用', data: [cpuUsage, ramUsage, diskUsage] },
    { name: '空闲', data: [100 - cpuUsage, 100 - ramUsage, 100 - diskUsage] }
  ]
})

const resourceChartOptions = ref({
  chart: {
    type: 'bar',
    height: 320,
    stacked: true
  },
  responsive: [
    {
      breakpoint: 480,
      options: {
        legend: {
          position: 'bottom',
          offsetX: -10,
          offsetY: 0
        }
      }
    }
  ],
  xaxis: {
    categories: ['CPU', 'RAM', 'Disk']
  },
  yaxis: {
    min: 0,
    max: 100,
    tickAmount: 5,
    labels: {
      formatter: (val) => val.toFixed(2) + '%'
    }
  },
  fill: {
    opacity: 1
  },
  legend: {
    position: 'right',
    offsetX: 0,
    offsetY: 40
  },
  tooltip: {
    y: {
      formatter: (val) => val + '%'
    }
  }
})

const trendDays = computed(() => [...new Set((dashboardData.value?.trend || []).map((item) => item.day))])
const scanChartSeries = computed(() => {
  const trend = dashboardData.value?.trend || []
  const scanners = [...new Set(trend.map((item) => item.scanner))]
  return scanners.map((scanner) => ({
    name: scanner,
    data: trendDays.value.map((day) => trend.find((item) => item.day === day && item.scanner === scanner)?.count || 0)
  }))
})

const scanChartOptions = computed(() => ({
  chart: {
    type: 'bar',
    height: 320,
    stacked: true,
    toolbar: {
      show: true
    },
    zoom: {
      enabled: true
    }
  },
  responsive: [
    {
      breakpoint: 480,
      options: {
        legend: {
          position: 'bottom',
          offsetX: -10,
          offsetY: 0
        }
      }
    }
  ],
  plotOptions: {
    bar: {
      horizontal: false,
      borderRadius: 10,
      borderRadiusApplication: 'end',
      borderRadiusWhenStacked: 'last',
      dataLabels: {
        total: {
          enabled: true,
          style: {
            fontSize: '13px',
            fontWeight: 900
          }
        }
      }
    }
  },
  xaxis: {
    type: 'datetime',
    categories: trendDays.value
  },
  legend: {
    position: 'right',
    offsetY: 40
  },
  fill: {
    opacity: 1
  }
}))

// 仪表盘中任务表最大显示10行
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts = []
  if (d > 0) parts.push(`${d}天`)
  if (h > 0) parts.push(`${h}小时`)
  if (m > 0 || parts.length === 0) parts.push(`${m}分钟`)
  return parts.join(' ')
}

const uptime = computed(() => {
  const s = systemData.value?.status_item?.[0]?.server_run_time
  return s !== undefined ? formatUptime(s) : '--'
})

const networkInterfaces = computed(() => {
  const net = systemData.value?.status_item?.[0]?.network?.net
  if (!net) return []
  return Object.entries(net).map(([name, info]) => ({
    name,
    send: formatBytes(Number(info.send)),
    receive: formatBytes(Number(info.receive)),
  }))
})

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)
  return `${val} ${units[i]}`
}

onMounted(() => {
  fetchSystemData()
  fetchDashboardData()
  refreshTimer = setInterval(fetchSystemData, 5000)
  dashboardTimer = setInterval(fetchDashboardData, 30000)
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  if (dashboardTimer) clearInterval(dashboardTimer)
})

// status: 0 => 扫描中 、1 => 扫描结束 、2 => 待扫描 、3 => 出现错误
const taskList = computed(() => (dashboardData.value?.current_tasks || []).map((task) => ({
  taskid: task.task_id,
  scannerId: task.scanner || '未分配',
  target: task.target?.join(', ') || '-',
  operationPerson: task.initiator,
  status: task.status,
  remark: task.remark || '-'
})))

const stateConfig = {
  running: { class: 'scan_open', text: '扫描中' },
  pending: { class: 'scan_wait', text: '等待' },
  succeeded: { class: 'scan_success', text: '成功' },
  failed: { class: 'scan_faild', text: '错误' },
  cancelled: { class: 'scan_faild', text: '已取消' }
}
</script>
