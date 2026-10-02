<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { useChartTheme } from '@/composables/useChartTheme'
import { chartLabels, chartSeries, downloadBlob, imageCaption, metrics, rowLabel } from '@/utils/statistics'
import { renderChartTooltip } from '@/utils/chartTooltip'
import { formatDateTime } from '@/utils/systemTime'

const props = defineProps({
  rows: { type: Array, required: true }, meta: { type: Object, required: true },
  metric: { type: String, required: true }, type: { type: String, required: true }, title: { type: String, required: true },
})
const ApexChart = defineAsyncComponent(() => import('vue3-apexcharts/core'))
const containerRef = ref(null)
const chartWidth = ref('100%')
let observer
const apexType = computed(() => props.type === 'stacked' ? 'bar' : props.type)
const series = computed(() => chartSeries(props.rows, props.meta, props.metric, props.type))
const height = computed(() => props.type === 'bar' && !['day', 'week', 'month'].includes(props.meta.group_by) ? Math.max(380, props.rows.length * 28 + 80) : 400)
let mounted = true
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    const width = Math.floor(entry.contentRect.width)
    if (width > 0 && width !== chartWidth.value) chartWidth.value = width
  })
  observer.observe(containerRef.value)
})
onBeforeUnmount(() => { mounted = false; observer?.disconnect() })

function buildOptions() {
  const labels = props.rows.map((row) => rowLabel(row.label, props.meta.group_by))
  const horizontal = props.type === 'bar' && !['day', 'week', 'month'].includes(props.meta.group_by)
  return {
    chart: { type: apexType.value, stacked: props.type === 'stacked', toolbar: { show: false }, animations: { enabled: false }, fontFamily: 'Arial, "Microsoft YaHei", sans-serif' },
    colors: props.type === 'stacked' ? ['#22c55e', '#ef4444', '#f59e0b', '#94a3b8'] : ['#3b82f6', '#14b8a6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'],
    labels,
    xaxis: { categories: props.type === 'heatmap' ? [] : labels, labels: { rotate: -35, hideOverlappingLabels: true }, tickAmount: 12, title: { text: horizontal ? metrics[props.metric].unit : '' } },
    yaxis: { min: 0, title: { text: props.type === 'heatmap' || horizontal ? '' : metrics[props.metric].unit }, labels: { formatter: (n) => horizontal || props.type === 'heatmap' ? String(n) : Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) } },
    plotOptions: { bar: { horizontal }, heatmap: { shadeIntensity: 0.5, radius: 2 } },
    dataLabels: { enabled: props.type === 'donut' }, stroke: { width: props.type === 'line' ? 2 : 0, curve: 'straight' },
    legend: { position: 'bottom', show: ['stacked', 'donut'].includes(props.type) },
    tooltip: {
      custom: ({ series: values, seriesIndex, dataPointIndex, w }) => {
        if (props.type === 'heatmap') {
          const point = w.config.series[seriesIndex].data[dataPointIndex]
          return renderChartTooltip({ title: point.dateLabel, rows: [{ label: metrics[props.metric].label, value: point.y ?? '--' }] })
        }
        if (props.type === 'donut') return renderChartTooltip({ title: labels[seriesIndex], rows: [{ label: metrics[props.metric].label, value: values[seriesIndex] }] })
        return renderChartTooltip({ title: labels[dataPointIndex], rows: w.config.series.map((s, index) => ({ label: s.name, value: values[index][dataPointIndex] ?? '--' })) })
      },
    },
  }
}
const options = useChartTheme(buildOptions)

function footerLines() {
  return [
    `生成时间：${formatDateTime(props.meta.generated_at, props.meta.timezone)} · ${props.meta.data_as_of ? `处理水位：${formatDateTime(props.meta.data_as_of, props.meta.timezone)}` : '基于查询时保留的数据'} · ${chartLabels[props.type]}`,
    `扫描器：${props.meta.scanner_id || '全部'} · 任务来源：${rowLabel(props.meta.task_source, 'task_source') || '全部'} · 口径版本：${props.meta.metric_version}`,
    props.meta.notes[0],
    props.meta.data_type === 'discovery' ? 'IP 按分组独立去重，周期去重数不能累加分组数量。' : props.meta.notes.at(-1),
  ].filter(Boolean)
}

async function exportImage({ format, width, background, filename }) {
  const { default: ApexCharts } = await import('apexcharts')
  if (!mounted) return
  const container = document.createElement('div')
  Object.assign(container.style, { position: 'fixed', left: '-10000px', top: '0', width: `${width}px` })
  document.body.appendChild(container)
  const chartHeight = Math.max(440, height.value)
  const chart = new ApexCharts(container, {
    ...buildOptions(), theme: { mode: 'light' },
    chart: { ...buildOptions().chart, width, height: chartHeight, background: background === 'white' ? '#ffffff' : 'rgba(0, 0, 0, 0)', foreColor: '#1f2937' },
    title: { text: props.title, style: { fontSize: `${Math.min(20, Math.floor((width - 40) / Math.max(1, props.title.length)))}px`, color: '#1f2937' } },
    subtitle: { text: imageCaption(props.meta), style: { fontSize: '12px', color: '#4b5563' } },
    series: series.value,
  })
  try {
    await document.fonts.ready
    await chart.render()
    const lines = footerLines()
    const footerHeight = lines.length * 22 + 24
    let blob
    if (format === 'svg') {
      const svg = new DOMParser().parseFromString(await chart.getSvgString(), 'image/svg+xml').documentElement
      svg.setAttribute('height', `${chartHeight + footerHeight}`)
      svg.setAttribute('viewBox', `0 0 ${width} ${chartHeight + footerHeight}`)
      if (background === 'white') {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        rect.setAttribute('width', '100%'); rect.setAttribute('height', '100%'); rect.setAttribute('fill', '#ffffff')
        svg.prepend(rect)
      }
      lines.forEach((line, index) => {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        text.setAttribute('x', '16'); text.setAttribute('y', String(chartHeight + 20 + index * 22))
        text.setAttribute('fill', '#4b5563'); text.setAttribute('font-size', '12'); text.setAttribute('font-family', 'Arial, Microsoft YaHei, sans-serif')
        text.textContent = line
        svg.appendChild(text)
      })
      blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' })
    } else {
      const { imgURI } = await chart.dataURI({ scale: 2 })
      const image = new Image()
      image.src = imgURI
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = width * 2; canvas.height = (chartHeight + footerHeight) * 2
      const context = canvas.getContext('2d')
      if (!context) throw new Error('浏览器不支持图片导出')
      if (background === 'white') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height) }
      context.drawImage(image, 0, 0)
      context.fillStyle = '#4b5563'; context.font = '24px Arial, "Microsoft YaHei", sans-serif'
      lines.forEach((line, index) => context.fillText(line, 32, (chartHeight + 20 + index * 22) * 2))
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('图片生成失败')
    }
    if (mounted) downloadBlob(blob, `${filename}.${format}`)
  } finally {
    chart.destroy()
    container.remove()
  }
}
defineExpose({ exportImage })
</script>

<template>
  <div ref="containerRef" class="min-w-0 w-full">
    <ApexChart :key="`${meta.generated_at}-${type}-${metric}-${chartWidth}`" :type="apexType" :width="chartWidth" :height="height" :options="options" :series="series" />
  </div>
</template>
