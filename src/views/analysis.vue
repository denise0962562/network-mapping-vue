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
  if (serviceDimension.value === 'protocol') return protocolStats

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
  return [...pieSourceData.value].sort((a, b) => b.value - a.value).slice(0, topN.value)
})
const pieSeries = computed(() => pieTopData.value.map((item) => item.value))
const pieLabels = computed(() => pieTopData.value.map((item) => item.name))

const pieOptions = computed(() => ({
  chart: { type: 'pie' },
  labels: pieLabels.value,
  legend: { position: 'bottom' },
  dataLabels: { enabled: true },
  stroke: { width: 1 }
}))

const recentWeeks = 12
const weekdayRows = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function startOfWeekMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay() // Sun=0
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function pseudoRandom(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function simulateDailyScanCount(date) {
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000)
  const r1 = pseudoRandom(dayOfYear)
  const r2 = pseudoRandom(dayOfYear + 99)
  const r3 = pseudoRandom(dayOfYear + 199)
  const missingChance = pseudoRandom(dayOfYear + 777)

  // simulate missing records: keep cells empty when no data
  if (missingChance < 0.08) return null

  let count = 8000 + Math.floor(r1 * 12000)
  if (r2 > 0.96) {
    count += 280000 + Math.floor(r3 * 720000)
  } else if (r2 > 0.86) {
    count += 50000 + Math.floor(r3 * 180000)
  }
  return count
}

const weekStarts = computed(() => {
  const today = new Date()
  const currentWeekStart = startOfWeekMonday(today)
  const arr = []
  for (let i = recentWeeks - 1; i >= 0; i -= 1) {
    const d = new Date(currentWeekStart)
    d.setDate(d.getDate() - i * 7)
    arr.push(d)
  }
  return arr
})

const weekLabels = computed(() => {
  return weekStarts.value.map((d) => {
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${m}/${day}`
  })
})

const heatmapSeries = computed(() => {
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  return weekdayRows.map((rowName, rowIndex) => ({
    name: rowName,
    data: weekStarts.value.map((weekStart, weekIndex) => {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + rowIndex)

      const yyyy = date.getFullYear()
      const mm = String(date.getMonth() + 1).padStart(2, '0')
      const dd = String(date.getDate()).padStart(2, '0')
      const dateLabel = `${yyyy}-${mm}-${dd}`

      if (date > today) {
        return { x: weekLabels.value[weekIndex], y: null, dateLabel }
      }

      return {
        x: weekLabels.value[weekIndex],
        y: simulateDailyScanCount(date),
        dateLabel
      }
    })
  }))
})

const allHeatValues = computed(() => {
  return heatmapSeries.value
    .flatMap((series) => series.data.map((point) => point.y))
    .filter((value) => value !== null)
    .sort((a, b) => a - b)
})

function quantile(sortedArr, q) {
  if (!sortedArr.length) return 0
  const pos = (sortedArr.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sortedArr[base + 1] !== undefined) {
    return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base])
  }
  return sortedArr[base]
}

const heatmapOptions = computed(() => {
  const values = allHeatValues.value
  const minVal = values[0] ?? 0
  const maxVal = values[values.length - 1] ?? 0
  const q40 = quantile(values, 0.4)
  const q80 = quantile(values, 0.8)

  return {
    chart: {
      type: 'heatmap',
      toolbar: { show: false }
    },
    dataLabels: { enabled: false },
    xaxis: {
      type: 'category',
      title: { text: '最近12周（按周起始日）' }
    },
    yaxis: {
      title: { text: '周几' }
    },
    title: {
      text: '扫描数热力图（最近12周）'
    },
    plotOptions: {
      heatmap: {
        shadeIntensity: 1,
        colorScale: {
          ranges: [
            { from: minVal, to: q40, name: '0% - 40%', color: 'rgb(0, 143, 251)' },
            { from: q40 + 1, to: q80, name: '40% - 80%', color: 'rgb(0, 227, 150)' },
            { from: q80 + 1, to: maxVal, name: '80% - 100%', color: 'rgb(255, 69, 96)' }
          ]
        }
      }
    },
    tooltip: {
      custom({ series, seriesIndex, dataPointIndex, w }) {
        const point = w.config.series[seriesIndex].data[dataPointIndex]
        const value = series[seriesIndex][dataPointIndex]
        if (value === null || value === undefined) return ''
        return `<div class="p-2 text-xs">
          <div><strong>${w.config.series[seriesIndex].name}</strong></div>
          <div>日期: ${point.dateLabel}</div>
          <div>扫描IP数: ${value}</div>
        </div>`
      }
    }
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
            <input
              v-model="ignoreVersionDiff"
              type="checkbox"
              class="toggle toggle-primary mt-2"
              :disabled="serviceDimension === 'protocol'"
            />
          </label>
        </div>

        <apexchart type="pie" height="320" :options="pieOptions" :series="pieSeries" />
      </div>

      <div class="card bg-base-100 card-border border-base-300 p-4">
        <div class="mb-3">
          <h3 class="font-semibold">扫描数热力图</h3>
          <p class="text-xs opacity-60">Y 轴为周几，X 轴为最近 12 周，无数据天留空</p>
        </div>

        <apexchart type="heatmap" height="380" :options="heatmapOptions" :series="heatmapSeries" />
      </div>
    </div>
  </div>
</template>
