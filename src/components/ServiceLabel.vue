<script setup>
import { computed } from 'vue'
import { nativeEvidence, serviceLabel } from '@/utils/serviceDetection'
const props = defineProps({ service: { type: String, default: null }, data: { type: Object, default: null } })
const evidence = computed(() => nativeEvidence(props.data))
</script>

<template>
  <details v-if="service && evidence.length" class="text-xs">
    <summary class="cursor-pointer leading-6"><span class="badge badge-outline badge-sm">{{ serviceLabel(service) }}</span></summary>
    <div class="my-2 min-w-48 space-y-2 rounded-lg border border-base-300 bg-base-200/50 p-3">
      <template v-for="item in evidence" :key="item.module">
        <p v-if="item.module === 'dns'">DNS TCP 响应码：{{ item.result.response_code }}；响应已通过请求关联校验。</p>
        <p v-else>RFB 协议版本：{{ item.result.protocol_version }}。仅确认服务端问候，未进行认证。</p>
      </template>
    </div>
  </details>
  <span v-else-if="['dns', 'vnc'].includes(service)" class="badge badge-outline badge-sm">{{ serviceLabel(service) }}</span>
  <span v-else>{{ serviceLabel(service) }}</span>
</template>
