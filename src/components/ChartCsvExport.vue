<script setup>
import { computed } from 'vue'
import { Download } from '@lucide/vue'
import { chartCsvData, downloadChartCsv } from '@/utils/chartCsv'

const props = defineProps({
  series: { type: Array, default: () => [] },
  options: { type: Object, default: () => ({}) },
  data: { type: Object, default: null },
  filename: { type: String, required: true },
  categoryHeader: { type: String, default: '类别' },
  valueHeader: { type: String, default: '数量' },
  unit: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
})
const csvData = computed(() => props.data ?? chartCsvData(props))
</script>

<template>
  <button
    type="button"
    class="btn btn-ghost btn-sm shrink-0 print:hidden"
    :disabled="disabled || !csvData.rows.length"
    title="导出当前图表数据为 CSV"
    @click="downloadChartCsv(csvData, filename)"
  >
    <Download class="size-4" aria-hidden="true" />
    导出 CSV
  </button>
</template>
