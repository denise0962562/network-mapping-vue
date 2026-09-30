<script setup>
import { useChartTheme } from '@/composables/useChartTheme'
import { computed, defineAsyncComponent } from 'vue'
const props = defineProps({ items: { type: Array, default: () => [] } })
const ApexChart = defineAsyncComponent(() => import('vue3-apexcharts/core'))
const series = computed(() => [
  { name: '成功', data: props.items.map((d) => d.succeeded || 0) },
  { name: '失败', data: props.items.map((d) => d.failed || 0) },
  { name: '部分完成', data: props.items.map((d) => d.partial || 0) },
  { name: '取消', data: props.items.map((d) => d.cancelled || 0) },
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
  <ApexChart type="bar" height="300" :options="options" :series="series" />
</template>
