<script setup>
import { computed } from 'vue'
import { intelError } from '../utils/threatIntel'
const props = defineProps({ report: { type: Object, default: null } })
const rejected = computed(() => Number.isSafeInteger(props.report?.rejected) && props.report.rejected > 0 ? props.report.rejected : 0)
const samples = computed(() => Array.isArray(props.report?.rejection_samples) ? props.report.rejection_samples.slice(0, 100) : [])
</script>

<template>
  <details v-if="rejected" class="mt-2 max-w-3xl text-sm">
    <summary class="cursor-pointer text-warning">已隔离 {{ rejected }} 条格式异常记录</summary>
    <p class="my-2">有效记录按来源策略处理；下列记录未生成标记，也不进入 AI 审核队列。离线导入的原文件保留在服务端缓存中，直到被新上传替换。</p>
    <div class="overflow-x-auto"><table class="table table-xs"><thead><tr><th>记录 / 来源 ID</th><th>类型与原值</th><th>原因</th></tr></thead><tbody>
      <tr v-for="(row, index) in samples" :key="index"><td>{{ row.record }} / {{ row.external_id || '无' }}<p v-if="row.file" class="max-w-xs break-all opacity-60">{{ row.file }}</p></td><td class="max-w-sm break-all"><span class="opacity-60">{{ row.type }}</span><p class="whitespace-pre-wrap">{{ row.value }}</p></td><td>{{ intelError(row.code) }}</td></tr>
    </tbody></table></div>
    <p v-if="rejected > samples.length" class="mt-2 opacity-60">仅展示前 {{ samples.length }} 条异常记录。</p>
  </details>
</template>
