<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { formatChartTooltipTime, renderChartTooltip } from '@/utils/chartTooltip'

const props = defineProps({
  tooltip: {
    type: Object,
    default: null
  }
})

const tooltipElement = ref(null)
const tooltipStyle = ref({})
const GAP = 12

function toTimestamp(value) {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function formatMaintenanceDuration(maintenance) {
  const startedAt = toTimestamp(maintenance.started_at)
  const endedAt = toTimestamp(maintenance.ended_at) ?? Date.now()
  if (startedAt === null || endedAt < startedAt) return '--'

  const seconds = Math.floor((endedAt - startedAt) / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`
  if (minutes > 0) return `${minutes} 分钟 ${remainingSeconds} 秒`
  return `${remainingSeconds} 秒`
}

const tooltipContent = computed(() => {
  const maintenance = props.tooltip?.maintenance
  if (!maintenance) return ''

  return renderChartTooltip({
    title: maintenance.in_progress ? '系统维护中' : '系统维护',
    rows: [
      { label: '开始时间', value: formatChartTooltipTime(maintenance.started_at), color: '#f59e0b' },
      { label: '结束时间', value: maintenance.ended_at ? formatChartTooltipTime(maintenance.ended_at) : '进行中' },
      { label: '预计结束', value: maintenance.expected_end_at ? formatChartTooltipTime(maintenance.expected_end_at) : '--' },
      { label: '实际时长', value: formatMaintenanceDuration(maintenance) },
      { label: '操作者', value: maintenance.operator_username || '--' }
    ],
    footer: maintenance.message ? `维护说明：${maintenance.message}` : ''
  })
})

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function overlaps(left, top, width, height, rect) {
  return left < rect.right && left + width > rect.left && top < rect.bottom && top + height > rect.top
}

function updatePosition() {
  const anchor = props.tooltip
  const element = tooltipElement.value
  if (!anchor || !element) return

  const width = element.offsetWidth
  const height = element.offsetHeight
  const maxLeft = Math.max(GAP, window.innerWidth - width - GAP)
  const maxTop = Math.max(GAP, window.innerHeight - height - GAP)
  let left = clamp(anchor.clientX + GAP, GAP, maxLeft)
  let top = clamp(anchor.clientY + GAP, GAP, maxTop)
  const chartTooltip = anchor.chartElement?.querySelector('.apexcharts-tooltip.apexcharts-active')

  if (chartTooltip) {
    const chartTooltipRect = chartTooltip.getBoundingClientRect()
    if (chartTooltipRect.width > 0 && chartTooltipRect.height > 0 && overlaps(left, top, width, height, chartTooltipRect)) {
      const belowTop = chartTooltipRect.bottom + GAP
      if (belowTop <= maxTop) {
        top = belowTop
        left = clamp(chartTooltipRect.left, GAP, maxLeft)
      } else {
        top = clamp(chartTooltipRect.top - height - GAP, GAP, maxTop)
        left = clamp(chartTooltipRect.left, GAP, maxLeft)
      }
    }
  }

  tooltipStyle.value = { left: `${left}px`, top: `${top}px` }
}

watch(() => props.tooltip, async (tooltip) => {
  if (!tooltip) return
  await nextTick()
  updatePosition()
})
</script>

<template>
  <div
    v-if="tooltip"
    ref="tooltipElement"
    class="pointer-events-none fixed z-[60] min-w-56 max-w-sm rounded-box border border-base-300 bg-base-100 shadow-xl"
    :style="tooltipStyle"
    v-html="tooltipContent"
  ></div>
</template>

<style>
.apexcharts-xaxis-annotation-label.system-maintenance-annotation-label {
  pointer-events: none;
}
</style>
