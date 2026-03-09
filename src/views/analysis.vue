<script setup>
import { computed, ref } from 'vue'

const topOptions = [5, 7, 10]
const topN = ref(5)
const serviceDimension = ref('protocol')
const ignoreVersionDiff = ref(true)

const protocolStats = [
  { name: 'HTTP', value: 31 },
  { name: 'HTTPS', value: 26 },
  { name: 'SSH', value: 15 },
  { name: 'DNS', value: 11 },
  { name: 'SMTP', value: 9 },
  { name: 'RDP', value: 6 },
  { name: 'FTP', value: 5 },
  { name: 'SNMP', value: 4 },
  { name: 'TELNET', value: 2 },
  { name: 'IMAP', value: 1 }
]

const appServiceStats = [
  { app: 'nginx', version: '1.24', value: 16 },
  { app: 'nginx', version: '1.26', value: 8 },
  { app: 'apache', version: '2.4', value: 11 },
  { app: 'django', version: '3.2', value: 7 },
  { app: 'django', version: '4.2', value: 6 },
  { app: 'redis', version: '6.2', value: 6 },
  { app: 'redis', version: '7.0', value: 5 },
  { app: 'mysql', version: '8.0', value: 7 },
  { app: 'postgresql', version: '14', value: 4 },
  { app: 'tomcat', version: '10', value: 3 },
  { app: 'mongodb', version: '6', value: 2 }
]

const pieSourceData = computed(() => {
  if (serviceDimension.value === 'protocol') {
    return protocolStats
  }

  if (!ignoreVersionDiff.value) {
    return appServiceStats.map((item) => ({
      name: `${item.app} ${item.version}`,
      value: item.value
    }))
  }

  const grouped = appServiceStats.reduce((acc, item) => {
    acc[item.app] = (acc[item.app] || 0) + item.value
    return acc
  }, {})

  return Object.entries(grouped).map(([name, value]) => ({ name, value }))
})

const pieTopData = computed(() => {
  return [...pieSourceData.value]
    .sort((a, b) => b.value - a.value)
    .slice(0, topN.value)
})

const pieSeries = computed(() => pieTopData.value.map((item) => item.value))
const pieLabels = computed(() => pieTopData.value.map((item) => item.name))

const pieOptions = computed(() => ({
  chart: {
    type: 'pie'
  },
  labels: pieLabels.value,
  legend: {
    position: 'bottom'
  },
  dataLabels: {
    enabled: true
  },
  stroke: {
    width: 1
  },
  tooltip: {
    y: {
      formatter: (value) => `${value}`
    }
  }
}))

const heatmapSeries = ref([
  {
    name: 'Week 1',
    data: [
      { x: 'Mon', y: 48 },
      { x: 'Tue', y: 52 },
      { x: 'Wed', y: 46 },
      { x: 'Thu', y: 61 },
      { x: 'Fri', y: 68 },
      { x: 'Sat', y: 34 },
      { x: 'Sun', y: 29 }
    ]
  },
  {
    name: 'Week 2',
    data: [
      { x: 'Mon', y: 53 },
      { x: 'Tue', y: 58 },
      { x: 'Wed', y: 50 },
      { x: 'Thu', y: 66 },
      { x: 'Fri', y: 72 },
      { x: 'Sat', y: 39 },
      { x: 'Sun', y: 31 }
    ]
  },
  {
    name: 'Week 3',
    data: [
      { x: 'Mon', y: 57 },
      { x: 'Tue', y: 64 },
      { x: 'Wed', y: 55 },
      { x: 'Thu', y: 70 },
      { x: 'Fri', y: 78 },
      { x: 'Sat', y: 42 },
      { x: 'Sun', y: 36 }
    ]
  },
  {
    name: 'Week 4',
    data: [
      { x: 'Mon', y: 60 },
      { x: 'Tue', y: 67 },
      { x: 'Wed', y: 59 },
      { x: 'Thu', y: 73 },
      { x: 'Fri', y: 80 },
      { x: 'Sat', y: 45 },
      { x: 'Sun', y: 38 }
    ]
  }
])

const heatmapOptions = ref({
  chart: {
    type: 'heatmap',
    toolbar: {
      show: false
    }
  },
  dataLabels: {
    enabled: false
  },
  colors: ['#008FFB'],
  xaxis: {
    type: 'category',
    title: {
      text: 'Weekday'
    }
  },
  yaxis: {
    title: {
      text: 'Week'
    }
  },
  title: {
    text: 'Weekly Scan Count Heatmap'
  }
})
</script>

<template>
  <div class="p-5">
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <div class="card bg-base-100 card-border border-base-300 p-4">
        <div class="mb-3">
          <h3 class="font-semibold">常见服务 Top X 分布</h3>
          <p class="text-xs opacity-60">实心 Pie 图</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <label class="form-control w-full">
            <span class="label-text text-xs mb-1">统计前几位</span>
            <select v-model.number="topN" class="select select-bordered select-sm">
              <option v-for="item in topOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>

          <label class="form-control w-full">
            <span class="label-text text-xs mb-1">统计维度</span>
            <select v-model="serviceDimension" class="select select-bordered select-sm">
              <option value="protocol">网络层协议（HTTP/HTTPS）</option>
              <option value="app">应用层服务（Nginx/Django）</option>
            </select>
          </label>

          <label class="form-control w-full">
            <span class="label-text text-xs mb-1">忽略版本差异</span>
            <input v-model="ignoreVersionDiff" type="checkbox" class="toggle toggle-primary mt-2" :disabled="serviceDimension === 'protocol'" />
          </label>
        </div>

        <apexchart type="pie" height="320" :options="pieOptions" :series="pieSeries" />
      </div>

      <div class="card bg-base-100 card-border border-base-300 p-4">
        <div class="mb-3">
          <h3 class="font-semibold">扫描数热力图</h3>
          <p class="text-xs opacity-60">Y 轴为周，X 轴为周几</p>
        </div>

        <apexchart type="heatmap" height="360" :options="heatmapOptions" :series="heatmapSeries" />
      </div>
    </div>
  </div>
</template>
