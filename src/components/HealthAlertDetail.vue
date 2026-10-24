<script setup>
import { tr } from '../i18n/index.js'

import { computed } from 'vue'
import { alertGuidance, diagnosticItems, policyItems, requestLogTarget } from '@/utils/healthAlerts'
import { formatDateTime } from '../i18n/time.js'

const props = defineProps({ item: { type: Object, required: true } })
defineEmits(['copy'])
const diagnostics = computed(() => diagnosticItems(props.item))
const policy = computed(() => policyItems(props.item))
const guidance = computed(() => alertGuidance(props.item))
const requestTarget = computed(() => requestLogTarget(props.item))
</script>

<template>
  <div class="space-y-5 p-4 md:p-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <h3 class="font-semibold">{{ tr("告警详情 · #") }}{{ item.id }}</h3>
        <p class="mt-1 whitespace-pre-wrap break-words text-sm">{{ item.summary || tr("未记录摘要") }}</p>
        <p class="mt-2 text-xs text-base-content/60">{{ tr("发生时间：") }}{{ item.occurred_at ? formatDateTime(item.occurred_at) : '--' }}</p>
        <p class="mt-1 break-all text-xs text-base-content/60">{{ tr("告警标识：") }}<span class="font-mono select-text">{{ item.alert_key || '--' }}</span></p>
      </div>
      <button class="btn btn-outline btn-sm" @click="$emit('copy', item)">{{ tr("复制完整记录") }}</button>
    </div>

    <div class="grid items-start gap-4 xl:grid-cols-3">
      <section class="min-w-0 rounded-box border border-base-300 bg-base-100 p-4 xl:col-span-2">
        <h4 class="mb-3 text-sm font-semibold">{{ tr("诊断数据") }} <span class="ml-1 font-normal text-base-content/50">{{ diagnostics.length }} {{ tr("项") }}</span></h4>
        <dl v-if="diagnostics.length" class="grid gap-3 sm:grid-cols-2">
          <div v-for="(detail, index) in diagnostics" :key="index" class="min-w-0 rounded-lg bg-base-200/60 p-3" :class="{ &#39;sm:col-span-2&#39;: [tr(&quot;查询&quot;), tr(&quot;请求路径&quot;), tr(&quot;请求 ID&quot;), &#39;Trace ID&#39;].includes(detail.label) || detail.value.length > 100 }">
            <dt class="text-xs text-base-content/60">{{ detail.label }}</dt>
            <dd class="mt-1 whitespace-pre-wrap break-all font-mono text-sm select-text" :class="{ 'max-h-80 overflow-y-auto': detail.label === '查询' }">{{ detail.value }}</dd>
          </div>
        </dl>
        <p v-else class="text-sm text-base-content/60">{{ tr("该历史记录未保存诊断字段，请结合告警标识与发生时间查询服务端日志。") }}</p>
      </section>

      <section class="min-w-0 rounded-box border border-base-300 bg-base-100 p-4">
        <h4 class="text-sm font-semibold">{{ tr("触发时的监控规则") }}</h4>
        <p class="mt-1 text-xs text-base-content/60">{{ tr("历史快照，不代表当前配置。") }}</p>
        <dl v-if="policy.length" class="mt-3 space-y-3 text-sm">
          <div v-for="(entry, index) in policy" :key="index" class="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <dt class="text-base-content/60">{{ entry.label }}</dt>
            <dd class="break-all font-mono">{{ entry.value }}</dd>
          </div>
        </dl>
        <p v-else class="mt-3 text-sm text-base-content/60">{{ tr("此记录未保存规则快照，无法还原当时的阈值与配置版本。") }}</p>
        <RouterLink to="/setting/runtime" class="btn btn-ghost btn-sm mt-3">{{ tr("查看当前监控配置") }}</RouterLink>
      </section>
    </div>

    <section class="rounded-box border border-info/20 bg-info/5 p-4">
      <h4 class="text-sm font-semibold">{{ tr("指标说明与排查建议") }}</h4>
      <p class="mt-2 text-sm text-base-content/70">{{ guidance.explanation }}</p>
      <ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-base-content/70">
        <li v-for="step in guidance.steps" :key="step">{{ step }}</li>
      </ol>
      <p class="mt-2 text-xs text-base-content/50">{{ tr("以上为排查方向，具体原因需结合日志与运行状态确认。") }}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <RouterLink v-if="requestTarget" :to="requestTarget" class="btn btn-outline btn-sm">{{ tr("查看同路径请求") }}</RouterLink>
        <RouterLink to="/analysis/performance" class="btn btn-ghost btn-sm">{{ tr("请求性能分析") }}</RouterLink>
      </div>
    </section>

    <details class="rounded-box border border-base-300 bg-base-100">
      <summary class="cursor-pointer p-3 text-sm font-medium">{{ tr("原始告警记录（JSON）") }}</summary>
      <pre class="max-h-96 overflow-auto whitespace-pre-wrap break-all border-t border-base-300 p-4 text-xs select-text">{{ JSON.stringify(item, null, 2) }}</pre>
    </details>
  </div>
</template>
