<script setup>
import { tr } from '../i18n/index.js'

import { computed } from 'vue'
import { articleDiagnosticRows } from '../utils/threatIntel'
const props = defineProps({ diagnostic: { type: Object, default: null }, articleId: { type: String, required: true }, kind: { type: String, default: 'error' } })
const rows = computed(() => articleDiagnosticRows(props.diagnostic))
</script>

<template>
  <details class="mt-2 max-w-md text-xs">
    <summary class="cursor-pointer" :class="{ 'text-error': kind === 'error' }">{{ kind === 'usage' ? tr("AI 请求与用量") : tr("错误详情") }}</summary>
    <dl class="mt-2 space-y-1 break-all">
      <div><dt class="inline opacity-60">{{ tr("文章 ID：") }}</dt><dd class="inline font-mono">{{ articleId }}</dd></div>
      <div v-for="row in rows" :key="row.key"><dt class="inline opacity-60">{{ row.label }}：</dt><dd class="inline">{{ row.value }}</dd></div>
    </dl>
    <p v-if="!rows.length" class="mt-2 opacity-60">{{ kind === 'usage' ? tr("接口未提供可展示的用量数据。") : tr("该历史失败未记录详细诊断，请重试后查看。") }}</p>
    <p v-if="kind === 'error'" class="mt-2 opacity-60">{{ tr("可用文章 ID 在服务端日志中查找 IntelArticleExtractionFailed。") }}</p>
  </details>
</template>
