<script setup>
import { tr } from '../i18n/index.js'

import { computed, onMounted, ref } from 'vue'
import { useConfigCheck } from '@/composables/useConfigCheck'
import { formatDateTime } from '../i18n/time.js'
import { deploymentConfigItems } from '@/utils/configCheck'

const props = defineProps({
  endpoint: { type: String, default: '' },
  report: { type: Object, default: null },
  title: { type: String, get default() { return tr("启动配置检查") } },
})
const { snapshot, loading, error, load } = useConfigCheck(() => props.endpoint)
const showOptional = ref(false)
const report = computed(() => props.report || snapshot.value)
const items = computed(() => deploymentConfigItems(report.value))
const defaults = computed(() => items.value.filter((item) => item.kind === 'default'))
const required = computed(() => items.value.filter((item) => item.kind === 'required'))
const optional = computed(() => items.value.filter((item) => item.kind === 'optional'))
const visibleItems = computed(() => items.value.filter((item) => showOptional.value || item.kind !== 'optional'))
const checkedAt = computed(() => report.value?.checked_at ? formatDateTime(new Date(report.value.checked_at)) : '-')
const sourceLabels = {
  get startup() { return tr("启动配置") },
  get local_limit() { return tr("本地部署限制") },
}

onMounted(() => load())
</script>

<template>
  <section class="card bg-base-100 card-border border-base-300 p-4">
    <div class="mb-3 flex items-start justify-between gap-3">
      <div>
        <h3 class="font-semibold">{{ title }}</h3>
        <p class="mt-1 text-xs opacity-60">{{ tr("仅检查部署配置文件中的参数；由 Web 管理并存储在数据库中的参数不列入提示。修改文件后需重启对应进程。") }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <button v-if="endpoint" class="btn btn-ghost btn-sm" :disabled="loading" @click="load(true)">{{ tr("重新读取") }}</button>
        <span v-else class="badge badge-ghost badge-sm">{{ tr("只读") }}</span>
      </div>
    </div>
    <div v-if="loading" role="status" class="flex items-center gap-2 py-3 text-sm opacity-60">
      <span class="loading loading-spinner loading-sm" />{{ tr("正在读取配置检查结果...") }} </div>
    <div v-else-if="error" role="alert" class="alert alert-error">
      <span>{{ error }}</span><button class="btn btn-sm" @click="load(true)">{{ tr("重试") }}</button>
    </div>
    <template v-else-if="report">
      <div v-if="required.length" role="alert" class="alert alert-warning">
        <span>{{ required.length }} {{ tr("个必需参数缺失，请根据下面的字段说明补齐。") }}</span>
      </div>
      <div v-else-if="defaults.length" role="status" class="alert alert-info">
        <span>{{ defaults.length }} {{ tr("个部署字段未显式配置，当前采用兼容默认值。可按需查看并补充配置。") }}</span>
      </div>
      <p v-else role="status" class="text-sm">{{ tr("配置检查通过，当前没有需要补充的启动参数。") }}</p>
      <p class="mt-3 text-xs leading-5 opacity-60">{{ tr("程序版本") }} {{ report.version }} {{ tr("· 检查时间") }} {{ checkedAt }}{{ tr("。下方展示最近一次启动时的配置快照及内置缺省值。") }}</p>
      <details v-if="items.length" class="mt-3 rounded-lg border border-base-300">
        <summary class="cursor-pointer px-3 py-2 text-sm font-medium">{{ tr("查看配置详情（") }}{{ defaults.length + required.length }} {{ tr("项提示，") }}{{ optional.length }} {{ tr("项未启用功能的可选参数）") }}</summary>
        <div class="px-3 pb-3">
          <label v-if="optional.length" class="mb-3 flex cursor-pointer items-center gap-2 text-sm">
            <input v-model="showOptional" type="checkbox" class="checkbox checkbox-sm" />{{ tr("显示未启用功能的可选参数") }} </label>
          <div v-if="visibleItems.length" class="overflow-x-auto">
            <table class="table table-sm">
              <thead><tr><th>{{ tr("字段") }}</th><th>{{ tr("处理方式 / 来源") }}</th><th>{{ tr("内置缺省值") }}</th><th>{{ tr("说明") }}</th></tr></thead>
              <tbody>
                <tr v-for="item in visibleItems" :key="item.field">
                  <td class="font-mono break-all">{{ item.field }}</td>
                  <td><span class="badge badge-sm" :class="item.kind === 'required' ? 'badge-warning' : 'badge-ghost'">{{ item.kind === 'required' ? tr("需要填写") : item.kind === 'optional' ? tr("可选") : tr("缺省处理") }}</span><p class="mt-1 text-xs opacity-60">{{ sourceLabels[item.source] || item.source }}</p></td>
                  <td class="max-w-64 font-mono break-all whitespace-pre-wrap">{{ item.default_value ?? (item.kind === 'required' ? tr("需自行填写") : tr("未设置")) }}</td>
                  <td class="min-w-48 text-xs leading-5">{{ item.description }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="py-2 text-sm opacity-60">{{ tr("当前仅有未启用功能的可选参数，无需补齐。") }}</p>
        </div>
      </details>
    </template>
    <p v-else class="text-sm opacity-60">{{ tr("尚未收到配置检查结果。扫描器需要支持此功能并成功上报心跳；停止的扫描器无法更新检查结果。") }}</p>
  </section>
</template>
