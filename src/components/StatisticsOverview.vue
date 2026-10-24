<script setup>
import { tr, uiText } from '../i18n/index.js'

import { onBeforeUnmount, onMounted, reactive } from 'vue'
import http from '@/utils/http'
import StatisticsChart from './StatisticsChart.vue'
import { queryBody, enrichStatistics, formatMetric } from '@/utils/statistics'
import { timeSettings, formatDateTime } from '../i18n/time.js'

const props = defineProps({ filters: { type: Object, required: true }, types: { type: Array, required: true } })
defineEmits(['open'])
const panels = reactive({})
const errors = reactive({})
const pending = reactive({})
const sections = [
  { id: 'discovery', get title() { return tr("IP 发现") }, metric: 'unique_ips', get label() { return tr("周期去重 IP") } },
  { id: 'tasks', get title() { return tr("任务执行") }, metric: 'completed', get label() { return tr("完成任务（含取消）") } },
  { id: 'port', get title() { return tr("端口分布") }, metric: 'count', get label() { return tr("端点观测数") } },
  { id: 'service', get title() { return tr("服务分布") }, metric: 'categories', get label() { return tr("服务类别数") } },
  { id: 'scanners', get title() { return tr("扫描器表现") }, metric: 'success_rate', get label() { return tr("执行成功率（%）") } },
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
  } catch (error) { if (!disposed && !controller.signal.aborted) errors[id] = error.response?.data?.message || tr("统计暂不可用") }
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
    <p class="text-xs opacity-60">{{ tr("总览按需依次加载基础指标，不计算耗时分位数或上期对比。进入专项分析可查看完整指标和明细；各模块保留独立统计时间。") }}</p>
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <section v-for="section in sections" :key="section.id" class="card border border-base-300 bg-base-100 p-4">
        <p class="text-xs opacity-60">{{ section.label }}</p>
        <div v-if="pending[section.id]" class="mt-3 skeleton h-8"></div>
        <template v-else-if="errors[section.id]"><p class="mt-2 text-xs text-error">{{ uiText(errors[section.id]) }}</p><button class="btn btn-xs btn-ghost mt-2" @click="retry(section.id)">{{ tr("重试") }}</button></template>
        <p v-else class="mt-2 text-2xl font-semibold">{{ formatMetric(panels[section.id]?.data.summary[section.metric], section.metric) }}</p>
        <p v-if="panels[section.id]" class="mt-2 text-xs opacity-60">{{ formatDateTime(panels[section.id].meta.generated_at) }}</p>
        <button class="btn btn-xs btn-ghost mt-3 self-start" @click="$emit('open', section.id)">{{ section.title }} →</button>
      </section>
    </div>
    <div class="grid gap-5 xl:grid-cols-2">
      <section v-for="kind in ['discovery', 'tasks']" :key="kind" class="card min-w-0 border border-base-300 bg-base-100 p-4">
        <h2 class="font-semibold">{{ kind === 'discovery' ? tr("每日 IP 发现") : tr("每日任务结果") }}</h2>
        <StatisticsChart v-if="panels[kind]" :rows="panels[kind].data.rows" :meta="panels[kind].meta" :metric="kind === 'discovery' ? 'count' : 'completed'" :type="kind === 'discovery' ? 'line' : 'stacked'" :title="kind === &#39;discovery&#39; ? tr(&quot;每日 IP 发现&quot;) : tr(&quot;每日任务结果&quot;)" @select="$emit('open', kind)" />
        <p v-else class="py-12 text-center text-sm opacity-60">{{ uiText(errors[kind] || '') || tr("等待统计结果…") }}</p>
      </section>
    </div>
    <div class="grid gap-5 xl:grid-cols-2">
      <section v-for="kind in ['port', 'service']" :key="kind" class="card border border-base-300 bg-base-100 p-4">
        <div class="flex items-center justify-between"><h2 class="font-semibold">{{ kind === 'port' ? tr("端口 Top 5") : tr("服务 Top 5") }}</h2><button class="btn btn-xs btn-ghost" @click="$emit('open', kind)">{{ tr("查看全部") }}</button></div>
        <div class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>{{ tr("类别") }}</th><th>{{ tr("观测数") }}</th><th>{{ tr("占比") }}</th></tr></thead><tbody><tr v-for="row in (panels[kind]?.data.rows || []).slice(0, 5)" :key="row.label"><td>{{ row.label }}</td><td>{{ formatMetric(row.count, 'count') }}</td><td>{{ formatMetric(row.percentage, 'percentage') }}%</td></tr><tr v-if="!panels[kind]?.data.rows.length"><td colspan="3" class="py-6 text-center opacity-60">{{ uiText(errors[kind] || '') || (panels[kind] ? tr("暂无数据") : tr("等待统计结果…")) }}</td></tr></tbody></table></div>
      </section>
    </div>
  </div>
</template>
