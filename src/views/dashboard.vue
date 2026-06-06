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
      <apexchart type="bar" height="320" :options="resourceChartOptions" :series="resourceChartSeries" />
    </div>

    <div class="card bg-base-100 card-border border-base-300 p-4">
      <div class="mb-3">
        <h3 class="font-semibold">最近 7 天扫描情况</h3>
        <p class="text-xs opacity-60">按扫描器统计</p>
      </div>
      <apexchart type="bar" height="320" :options="scanChartOptions" :series="scanChartSeries" />
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 p-5">
    
  </div>   
  <!-- 资源卡片结束 -->

  <!-- 系统信息及扫描日志卡片 -->
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-5 p-5">
    <div class="big_card">
      
      <!-- 系统信息列表 -->
      <ul class="list">

        <li class="p-4 pb-2 text-xs opacity-60 tracking-wide">系统详细信息</li>

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
 
      <div class="overflow-x-auto">
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import http from '@/utils/http'

const datalabel = ref(true)
const alerts = ref([])

const systemData = ref(null)
const systemDataErrorVisible = ref(false)
let refreshTimer = null

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

async function fetchSystemData() {
  try {
    const response = await http.get('/api/data/system-data')
    if (response.data) {
      systemData.value = response.data
      systemDataErrorVisible.value = false
    }
  } catch (error) {
    console.error('fetch system data failed', error)
    if (!systemDataErrorVisible.value) {
      systemDataErrorVisible.value = true
      pushAlert('error', '系统数据获取失败', '已保留上一次可用数据。', 7000)
    }
  }
}

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

const scanChartSeries = ref([
  {
    name: 'scanner-01',
    data: [32, 45, 36, 51, 49, 40, 43]
  },
  {
    name: 'scanner-02',
    data: [21, 26, 29, 24, 31, 28, 33]
  },
  {
    name: 'scanner-03',
    data: [12, 18, 15, 20, 17, 16, 19]
  },
  {
    name: 'scanner-04',
    data: [8, 11, 10, 14, 13, 12, 15]
  }
])

const scanChartOptions = ref({
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
    categories: [
      '2026-04-07T00:00:00.000Z',
      '2026-04-08T00:00:00.000Z',
      '2026-04-09T00:00:00.000Z',
      '2026-04-10T00:00:00.000Z',
      '2026-04-11T00:00:00.000Z',
      '2026-04-12T00:00:00.000Z',
      '2026-04-13T00:00:00.000Z'
    ]
  },
  legend: {
    position: 'right',
    offsetY: 40
  },
  fill: {
    opacity: 1
  }
})

// 仪表盘中任务表最大显示10行
const taskTableMaxRows = ref(10)

const series = ref([
  {
    name: "STOCK ABC",
    data: [30, 40, 35, 50, 22, 50, 70]
  },
  {
    name: "B",
    data: [40, 40, 11, 50, 49, 60, 70]
  }
])

const chartOptions = ref({
  chart: {
    type: 'area',
    height: 350,
  },
  dataLabels: {
    enabled: datalabel.value
  },
  stroke: {
    curve: 'smooth'
  },
  title: {
    text: 'Fundamental Analysis of Stocks',
    align: 'left'
  },
  subtitle: {
    text: 'Price Movements',
    align: 'left'
  },
  xaxis: {
    type: 'datetime',
    categories: ["2018-09-19T00:00:00.000Z", "2018-09-19T01:30:00.000Z", "2018-09-19T02:30:00.000Z", "2018-09-19T03:30:00.000Z", "2018-09-19T04:30:00.000Z", "2018-09-19T05:30:00.000Z", "2018-09-19T06:30:00.000Z"]
  },
  yaxis: {
    opposite: true
  },
  legend: {
    horizontalAlign: 'left'
  }
})

const chartref = ref(null)

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

function showDataLabel() {
  datalabel.value = !datalabel.value
  chartref.value.updateOptions({
    dataLabels: {
      enabled: datalabel.value
    }
  })
  console.log(`显示标签:${datalabel.value}`)
}

onMounted(() => {
  fetchSystemData()
  refreshTimer = setInterval(fetchSystemData, 5000)
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})

// status: 0 => 扫描中 、1 => 扫描结束 、2 => 待扫描 、3 => 出现错误
const taskList = ref([
  {
    taskid: "sdcdsa",
    scannerId: "scanner-01",
    target: "221.233.151.58/24",
    operationPerson: 'System',
    startin: "Today",
    status: 0,
    remark: ''
  },
  {
    taskid: "sdcdsb",
    scannerId: "scanner-01",
    target: "47.122.119.248/24,212.59.218.33/24",
    operationPerson: 'Admin',
    startin: "Today",
    status: 1,
    remark: ''
  }
])

const stateConfig = {
  0: {class: 'scan_open', text: '扫描中'},
  1: {class: 'scan_success', text: '成功'},
  2: {class: 'scan_wait', text: '等待'},
  3: {class: 'scan_faild', text: '错误'}
}
</script>
