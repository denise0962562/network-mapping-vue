<script setup>
import { computed, ref } from 'vue'
import { originLabel, safeReference } from '../utils/threatIntel'
const props = defineProps({ intel: { type: Object, default: null }, label: { type: String, default: '情报' } })
const dialog = ref(null)
const matches = computed(() => props.intel?.matches || [])
</script>

<template>
  <span v-if="intel" class="inline-flex items-center gap-1">
    <span v-if="!intel.available" class="badge badge-ghost badge-sm" title="情报存储暂时不可用，此状态不表示目标正常">情报暂不可用</span>
    <button v-else-if="intel.risk" type="button" class="badge badge-sm cursor-pointer" :class="intel.risk === 'malicious' ? 'badge-error' : 'badge-warning'" @click="dialog?.showModal()">{{ label }}：{{ intel.risk === 'malicious' ? '恶意' : '可疑' }}</button>
    <dialog ref="dialog" class="modal">
      <div class="modal-box w-11/12 max-w-3xl text-left whitespace-normal">
        <h2 class="text-lg font-semibold">{{ label }}命中证据</h2>
        <p class="mt-2 text-sm opacity-65">标记仅适用于下列 IOC 的精确范围。组织归因来自已接纳的具体报告；共享软件不会自动产生组织标签。</p>
        <article v-for="match in matches" :key="match.id" class="mt-4 rounded border border-base-300 p-3 space-y-2 text-sm">
          <div class="flex flex-wrap gap-2"><span class="badge badge-outline">{{ match.type }}</span><code class="break-all">{{ match.value }}</code></div>
          <p>{{ match.source_name }} · {{ originLabel(match) }}</p>
          <p v-if="match.actor">报告归因：{{ match.actor.name }}（{{ match.actor.id }}）</p>
          <p v-else-if="match.payload?.actor_name">报告原名：{{ match.payload.actor_name }}；尚未形成有效标准组织归因。</p>
          <p v-if="match.payload?.malware">软件 / 家族：{{ match.payload.malware }}<span v-if="match.software">（{{ match.software.id }}）</span></p>
          <p v-if="match.payload?.confidence != null">来源置信度：{{ match.payload.confidence }}（仅作为来源元数据）</p>
          <p v-if="match.payload?.first_seen || match.payload?.last_seen">首次：{{ match.payload.first_seen || '未提供' }} · 最近：{{ match.payload.last_seen || '未提供' }}</p>
          <blockquote v-if="match.payload?.evidence" class="border-l-2 border-base-300 pl-3 break-words whitespace-pre-wrap">{{ match.payload.evidence }}</blockquote>
          <a v-if="safeReference(match.payload?.reference)" :href="safeReference(match.payload.reference)" target="_blank" rel="noopener noreferrer" class="link">查看来源</a>
        </article>
        <div class="modal-action"><button type="button" class="btn" @click="dialog?.close()">关闭</button></div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>关闭</button></form>
    </dialog>
  </span>
</template>
