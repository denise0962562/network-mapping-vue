<script setup>
import { computed } from 'vue'
import { evidenceReasonLabel } from '../utils/threatIntel'
const props = defineProps({ report: { type: Object, default: null } })
const samples = computed(() => Array.isArray(props.report?.rejection_samples) ? props.report.rejection_samples.slice(0, 100) : [])
const corrections = computed(() => Array.isArray(props.report?.correction_samples) ? props.report.correction_samples.slice(0, 100) : [])
const groups = computed(() => {
  const counts = new Map()
  for (const sample of samples.value) {
    const label = evidenceReasonLabel(sample?.reason)
    counts.set(label, (counts.get(label) || 0) + 1)
  }
  return [...counts].map(([label, count]) => ({ label, count }))
})
</script>

<template>
  <details v-if="report?.rejected || report?.corrected" class="mt-2 text-xs">
    <summary class="cursor-pointer">证据校验详情（<template v-if="report.corrected">已纠正 {{ report.corrected }} 条，</template>{{ report.rejected || 0 }} 条未保留）</summary>
    <div class="mt-2 space-y-2">
      <p>以下为模型提议的证据校验结果；通过校验不代表已完成人工审核，请结合原文核对是否遗漏 IOC。</p>
      <p v-if="Number.isFinite(report.direct_accepted)">直接通过 {{ report.direct_accepted }} 条，纠正后通过 {{ report.corrected || 0 }} 条，未保留 {{ report.rejected || 0 }} 条。</p>
      <template v-if="report.corrected">
        <p>已根据所属记录的明确恶意标题和关联字段重新定位证据，并再次校验原文。</p>
        <p v-if="corrections.length < report.corrected" class="opacity-65">当前展示 {{ corrections.length }} 条纠正样本。</p>
        <ul v-if="corrections.length" class="max-h-48 overflow-auto space-y-1">
          <li v-for="(sample, index) in corrections" :key="index">第 {{ sample.record }} 条：{{ evidenceReasonLabel(sample.reason) }}；已根据所属记录标题重新定位<span v-if="sample.expected_context_block_id">（标题块 {{ sample.expected_context_block_id }}）</span>。</li>
        </ul>
      </template>
      <p v-for="group in groups" :key="group.label">{{ group.label }}：{{ group.count }} 条</p>
      <p v-if="samples.length < report.rejected" class="opacity-65">当前展示 {{ samples.length }} 条拒绝样本。</p>
      <ul v-if="samples.length" class="max-h-48 overflow-auto space-y-1">
        <li v-for="(sample, index) in samples" :key="index">第 {{ sample.record }} 条：{{ evidenceReasonLabel(sample.reason) }}<span v-if="sample.context_block_id && sample.ioc_block_id">（上下文块 {{ sample.context_block_id }} → IOC 块 {{ sample.ioc_block_id }}<template v-if="sample.ioc_scope_block_id">，所属标题块 {{ sample.ioc_scope_block_id }}</template>）</span></li>
      </ul>
    </div>
  </details>
</template>
