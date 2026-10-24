<script setup>
import { tr } from '../i18n/index.js'

import { useChartTheme } from '@/composables/useChartTheme'
import ChartCsvExport from '@/components/ChartCsvExport.vue'
import { computed, defineAsyncComponent } from 'vue'
const props = defineProps({
  items: { type: Array, default: () => [] },
  filename: { type: String, default: 'report-trend' }
})
const ApexChart = defineAsyncComponent(() => import('vue3-apexcharts/core'))
const series = computed(() => [
  { rawName: "成功", get name() { return tr("成功") }, data: props.items.map((d) => d.succeeded || 0) },
  { rawName: "失败", get name() { return tr("失败") }, data: props.items.map((d) => d.failed || 0) },
  { rawName: "部分完成", get name() { return tr("部分完成") }, data: props.items.map((d) => d.partial || 0) },
  { rawName: "取消", get name() { return tr("取消") }, data: props.items.map((d) => d.cancelled || 0) },
])
const options = useChartTheme(() => ({
  chart: { type: 'bar', stacked: true, toolbar: { show: false }, animations: { enabled: false } },
  xaxis: { categories: props.items.map((d) => d.day) },
  yaxis: { min: 0, forceNiceScale: true, labels: { formatter: (n) => Number.isInteger(n) ? String(n) : '' } },
  dataLabels: { enabled: false }, legend: { position: 'bottom' },
  colors: ['#22c55e', '#ef4444', '#f59e0b', '#94a3b8'],
}))
</script>

<template>
  <div class="flex justify-end">
    <ChartCsvExport
      :filename="filename"
      :series="series"
      :options="options"
      category-header="日期"
      unit="个任务"
    />
  </div>
  <ApexChart type="bar" height="300" :options="options" :series="series" />
</template>
