<script setup>
import { computed } from 'vue'
import { webLabel, technologyLabel } from '@/utils/webDetection'
import { formatDateTime } from '@/utils/systemTime'

const props = defineProps({ value: { type: Object, default: null } })
const label = computed(() => webLabel(props.value))
const technologies = computed(() => ['identified', 'partial'].includes(props.value?.status) && Array.isArray(props.value?.technologies) ? props.value.technologies.slice(0, 64) : [])
const confidence = { high: '高', medium: '中', low: '低' }
const usage = { referenced_resource: '页面引用资源', response_marker: '响应特征', multiple_evidence_types: '多种证据' }
</script>

<template>
  <details v-if="value && value.status !== 'not_web'" class="min-w-32 text-xs">
    <summary class="cursor-pointer leading-6">
      <span>{{ label }}</span>
      <span v-if="value.status === 'partial' && technologies.length" class="ml-1 text-warning">证据不完整</span>
      <span v-if="value.stale" class="ml-1 text-warning">证据可能过期</span>
    </summary>
    <div class="my-2 max-w-xl space-y-2 rounded-lg border border-base-300 bg-base-200/50 p-3 whitespace-normal">
      <p>根据扫描时该 IP 端点的 HTTP 响应识别；域名虚拟主机和隐藏依赖可能具有不同的技术栈。</p>
      <p v-if="value.status === 'pending'">后台正在处理已有证据，稍后刷新查看。</p>
      <p v-else-if="value.status === 'unsupported'">当前证据格式暂不支持识别。</p>
      <p v-else-if="!technologies.length">现有证据不足以识别框架或组件。</p>
      <p v-if="value.truncated" class="text-warning">采集或解析存在截断，结果可能不完整。</p>
      <p v-if="value.observed_at != null" class="opacity-60">证据时间：{{ formatDateTime(new Date(value.observed_at)) }}</p>
      <ul v-if="technologies.length" class="space-y-3">
        <li v-for="technology in technologies" :key="technology.id" class="border-t border-base-300 pt-2">
          <p class="font-medium">{{ technologyLabel(technology) }} <span class="font-normal opacity-60">置信度{{ confidence[technology.confidence] || technology.confidence }} · {{ usage[technology.usage] || technology.usage }}</span></p>
          <p v-if="technology.version_conflict" class="text-warning">存在多个版本线索，请查看证据。</p>
          <div v-for="(item, index) in technology.evidence?.slice(0, 8) || []" :key="index" class="mt-2">
            <div class="opacity-60">{{ item.module }} · {{ item.rule_id }}</div>
            <pre class="whitespace-pre-wrap break-all font-mono">{{ item.excerpt }}</pre>
            <div class="break-all opacity-60">{{ item.field_path }}</div>
            <div v-if="item.observation_ref" class="break-all opacity-60">观察记录：{{ item.observation_ref }}</div>
          </div>
        </li>
      </ul>
      <p class="opacity-50">规则版本：{{ value.ruleset_version }}。置信度为规则分级；引用资源不代表运行时使用。</p>
    </div>
  </details>
  <span v-else class="text-xs opacity-50">{{ label }}</span>
</template>
