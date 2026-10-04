<script setup>
import { onBeforeUnmount, onMounted, reactive } from 'vue'
import http from '@/utils/http'
import StatisticsChart from './StatisticsChart.vue'
import { queryBody, enrichStatistics, formatMetric } from '@/utils/statistics'
import { timeSettings, formatDateTime } from '@/utils/systemTime'

const props = defineProps({ filters: { type: Object, required: true }, types: { type: Array, required: true } })
defineEmits(['open'])
const panels = reactive({})
const errors = reactive({})
const pending = reactive({})
const sections = [
  { id: 'discovery', title: 'IP 发现', metric: 'unique_ips', label: '周期去重 IP' },
  { id: 'tasks', title: '任务执行', metric: 'completed', label: '完成任务（含取消）' },
  { id: 'port', title: '端口分布', metric: 'count', label: '端点观测数' },
  { id: 'service', title: '服务分布', metric: 'categories', label: '服务类别数' },
  { id: 'scanners', title: '扫描器表现', metric: 'success_rate', label: '执行成功率（%）' },
]
let controller = new AbortController(), disposed = false, active = false
async function load(id) {
  pending[id] = true; delete errors[id]
  try {
    const definition = props.types.find((type) => type.id === id)
    const body = queryBody({ ...props.filters, data_type: id, group_by: definition.groups[0], comparison: false }, timeSettings.timezone)
    body.metrics = definition.metrics.filter((key) => !['p50_ms', 'p95_ms'].includes(key))
    const response = await http.post('/api/analysis/statistics/query', body, { signal: controller.signal })
    if (!disposed) panels[id] = enrichStatistics(response.data)
  } catch (error) { if (!disposed && !controller.signal.aborted) errors[id] = error.response?.data?.message || '统计暂不可用' }
  finally { if (!disposed) pending[id] = false }
}
async function retry(id) { if (active) return; active = true; try { await load(id) } finally { active = false } }
onMounted(async () => {
  active = true
  // One request at a time: opening an overview must not multiply heavy queries.
  for (const section of sections) { if (disposed) break; await load(section.id) }
  active = false
})
onBeforeUnmount(() => { disposed = true; controller.abort() })
</script>

<template>
  <div class="mt-5 space-y-5">
    <p class="text-xs opacity-60">总览按需依次加载基础指标，不计算耗时分位数或上期对比。进入专项分析可查看完整指标和明细；各模块保留独立统计时间。</p>
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <section v-for="section in sections" :key="section.id" class="card border border-base-300 bg-base-100 p-4">
        <p class="text-xs opacity-60">{{ section.label }}</p>
        <div v-if="pending[section.id]" class="mt-3 skeleton h-8"></div>
        <template v-else-if="errors[section.id]"><p class="mt-2 text-xs text-error">{{ errors[section.id] }}</p><button class="btn btn-xs btn-ghost mt-2" @click="retry(section.id)">重试</button></template>
        <p v-else class="mt-2 text-2xl font-semibold">{{ formatMetric(panels[section.id]?.data.summary[section.metric], section.metric) }}</p>
        <p v-if="panels[section.id]" class="mt-2 text-xs opacity-60">{{ formatDateTime(panels[section.id].meta.generated_at) }}</p>
        <button class="btn btn-xs btn-ghost mt-3 self-start" @click="$emit('open', section.id)">{{ section.title }} →</button>
      </section>
    </div>
    <div class="grid gap-5 xl:grid-cols-2">
      <section v-for="kind in ['discovery', 'tasks']" :key="kind" class="card min-w-0 border border-base-300 bg-base-100 p-4">
        <h2 class="font-semibold">{{ kind === 'discovery' ? '每日 IP 发现' : '每日任务结果' }}</h2>
        <StatisticsChart v-if="panels[kind]" :rows="panels[kind].data.rows" :meta="panels[kind].meta" :metric="kind === 'discovery' ? 'count' : 'completed'" :type="kind === 'discovery' ? 'line' : 'stacked'" :title="kind === 'discovery' ? '每日 IP 发现' : '每日任务结果'" @select="$emit('open', kind)" />
        <p v-else class="py-12 text-center text-sm opacity-60">{{ errors[kind] || '等待统计结果…' }}</p>
      </section>
    </div>
    <div class="grid gap-5 xl:grid-cols-2">
      <section v-for="kind in ['port', 'service']" :key="kind" class="card border border-base-300 bg-base-100 p-4">
        <div class="flex items-center justify-between"><h2 class="font-semibold">{{ kind === 'port' ? '端口 Top 5' : '服务 Top 5' }}</h2><button class="btn btn-xs btn-ghost" @click="$emit('open', kind)">查看全部</button></div>
        <div class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>类别</th><th>观测数</th><th>占比</th></tr></thead><tbody><tr v-for="row in (panels[kind]?.data.rows || []).slice(0, 5)" :key="row.label"><td>{{ row.label }}</td><td>{{ formatMetric(row.count, 'count') }}</td><td>{{ formatMetric(row.percentage, 'percentage') }}%</td></tr><tr v-if="!panels[kind]?.data.rows.length"><td colspan="3" class="py-6 text-center opacity-60">{{ errors[kind] || (panels[kind] ? '暂无数据' : '等待统计结果…') }}</td></tr></tbody></table></div>
      </section>
    </div>
  </div>
</template>
