<script setup>
import { tr } from '../i18n/index.js'

import { computed } from 'vue'
const props = defineProps({ payload: { type: Object, default: () => ({}) }, locatable: Boolean })
defineEmits(['locate'])
const spans = computed(() => Array.isArray(props.payload?.evidence_spans) ? props.payload.evidence_spans.filter(span => ['ioc', 'context'].includes(span?.kind) && typeof span.quote === 'string').slice(0, 8) : [])
</script>

<template>
  <div v-if="spans.length" class="space-y-3 text-sm">
    <div v-for="(span, index) in spans" :key="index">
      <div class="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs opacity-70">
        <span>{{ span.kind === 'context' ? tr("上下文原文") : tr("IOC 原文") }} {{ tr("· 正文块") }} {{ span.block_id }}</span>
      </div>
      <blockquote class="border-l-2 border-base-300 pl-3 whitespace-pre-wrap break-words"><button v-if="locatable && span.kind === 'ioc'" type="button" class="link link-hover text-left font-mono" :aria-label="tr(&quot;定位原文&quot;)" @click="$emit('locate', span)">{{ span.quote }}</button><template v-else>{{ span.quote }}</template></blockquote>
    </div>
  </div>
  <blockquote v-else class="border-l-2 border-base-300 pl-3 whitespace-pre-wrap break-words text-sm">{{ payload?.evidence || tr("结构化来源记录") }}</blockquote>
</template>
