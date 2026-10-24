<script setup>
import { tr } from '../i18n/index.js'

import { computed, reactive, toRaw, useId, watch } from 'vue'
import SystemDateTimeInput from './SystemDateTimeInput.vue'
import { localToIso, toLocalInputValue } from '../i18n/time.js'

const formFieldId = useId()
const props = defineProps({ modelValue: { type: Object, required: true }, catalog: { type: Object, required: true }, disabled: Boolean })
const emit = defineEmits(['update:modelValue', 'validity-change'])
const fieldId = useId()
const policy = computed(() => props.modelValue)
const dateValues = reactive({ from_at: '', to_at: '' })
let emittedPolicy = null
function update(key, value) { emittedPolicy = { ...props.modelValue, [key]: value }; emit('update:modelValue', emittedPolicy) }
watch(() => props.modelValue, (value, previous) => {
  for (const key of ['from_at', 'to_at']) {
    if (toRaw(value) !== emittedPolicy || value[key] !== previous?.[key]) dateValues[key] = value[key] == null ? '' : toLocalInputValue(value[key])
  }
}, { immediate: true })
const validDates = computed(() => {
  try { for (const value of Object.values(dateValues)) if (value) localToIso(value); return true } catch { return false }
})
watch(validDates, value => emit('validity-change', value), { immediate: true })
function toggle(key, value, checked) {
  const items = new Set(props.modelValue[key] || [])
  if (checked) items.add(value); else items.delete(value)
  update(key, [...items])
}
function list(key, value) { update(key, [...new Set(value.split(/[\n,]+/).map(v => v.trim()).filter(Boolean))]) }
function date(key, value) {
  dateValues[key] = value
  try { update(key, value ? new Date(localToIso(value)).getTime() : null) } catch { /* Keep the wall time so its offset can be selected. */ }
}
const limits = [
  ['requests_per_minute', tr("每分钟调用"), 1000000], ['requests_per_day', tr("每日调用"), 1000000],
  ['searches_per_minute', tr("每分钟搜索"), 1000000], ['statistics_per_minute', tr("每分钟统计"), 1000000],
  ['tasks_per_minute', tr("每分钟扫描"), 1000000], ['tasks_per_day', tr("每日扫描"), 1000000],
  ['max_running_tasks', tr("未完成扫描任务"), 1000000], ['max_targets', tr("每任务最多地址"), 65536],
  ['max_ports', tr("每任务最多端口"), 65535], ['exports_per_day', tr("每日导出或报告"), 1000000],
  ['max_export_rows', tr("每次导出最多行"), 50000], ['max_webhooks', tr("最多事件订阅"), 1000000],
]
const scopeNames = {
  get 'metadata:read'() { return tr("接入信息") }, get 'assets:read'() { return tr("资产查询") }, get 'assets:refresh'() { return tr("刷新资产") }, get 'observations:read'() { return tr("历史观察") },
  get 'dns:read'() { return tr("DNS 数据") }, get 'vulnerabilities:read'() { return tr("漏洞观察") }, get 'vulnerabilities:evidence'() { return tr("漏洞详细证据") },
  get 'tags:read'() { return tr("授权标签") }, get 'annotations:read'() { return tr("读取注释") }, get 'annotations:write'() { return tr("维护注释") },
  get 'tasks:read'() { return tr("任务结果") }, get 'tasks:create'() { return tr("创建扫描") }, get 'tasks:cancel'() { return tr("取消扫描") }, get 'tasks:retry'() { return tr("重试扫描") },
  get 'analytics:read'() { return tr("统计分析") }, get 'reports:read'() { return tr("读取报告") }, get 'reports:create'() { return tr("生成报告") },
  get 'exports:read'() { return tr("读取导出") }, get 'exports:create'() { return tr("创建导出") }, get 'events:read'() { return tr("读取事件") }, get 'webhooks:manage'() { return tr("事件订阅") },
  get 'saved_searches:manage'() { return tr("保存查询") },
}
</script>

<template>
  <fieldset :disabled="disabled" class="space-y-5">
    <div class="grid gap-4 md:grid-cols-2">
      <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-1`">{{ tr("可见数据") }}</label></legend><select :id="`${formFieldId}-1`" class="select select-bordered w-full" :value="policy.data_mode" @change="update('data_mode', $event.target.value)"><option value="application">{{ tr("仅此应用创建的扫描") }}</option><option value="owner">{{ tr("责任用户的已有数据") }}</option></select><span class="mt-1 text-xs opacity-60">{{ tr("仍受目标、时间和字段范围限制。") }}</span></fieldset>
      <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-2`">{{ tr("批准标签 ID") }}</label></legend><input :id="`${formFieldId}-2`" class="input input-bordered w-full" :value="(policy.tag_ids || []).join(', ')" :placeholder="tr(&quot;如 1, 2（空表示不开放标签目录）&quot;)" @change="update('tag_ids', $event.target.value.split(',').map(v => Number(v.trim())).filter(v => v > 0))" /></fieldset>
    </div>
    <div><p class="mb-2 text-sm font-medium">{{ tr("功能权限") }}</p><div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><label v-for="scope in catalog.scopes || []" :key="scope" class="flex items-start gap-2 rounded-lg border border-base-300 p-2 text-sm"><input type="checkbox" class="checkbox checkbox-sm mt-0.5" :checked="policy.scopes?.includes(scope)" @change="toggle('scopes', scope, $event.target.checked)" /><span>{{ scopeNames[scope] || scope }}<span class="block text-xs opacity-50">{{ scope }}</span></span></label></div></div>
    <div><p class="mb-2 text-sm font-medium">{{ tr("可返回字段") }}</p><div class="flex flex-wrap gap-3"><label v-for="field in catalog.fields || []" :key="field" class="flex items-center gap-1 text-xs"><input class="checkbox checkbox-xs" type="checkbox" :checked="policy.fields?.includes(field)" @change="toggle('fields', field, $event.target.checked)" />{{ field }}</label></div></div>
    <div class="grid gap-4 md:grid-cols-2">
      <fieldset v-for="[key, label, hint] in [[&#39;cidrs&#39;, tr(&quot;允许 IP/CIDR&quot;), tr(&quot;读取为空时沿用所属数据；提交 IP 扫描必须明确授权&quot;)], [&#39;excluded_cidrs&#39;, tr(&quot;排除 IP/CIDR&quot;), tr(&quot;扫描与排除网段相交时拒绝整个目标&quot;)], [&#39;domains&#39;, tr(&quot;允许域名&quot;), tr(&quot;按标签边界允许子域名；域名扫描必须明确授权&quot;)], [&#39;ip_allowlist&#39;, tr(&quot;调用来源 CIDR&quot;), tr(&quot;为空表示不附加来源限制&quot;)] ]" :key="key" class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${fieldId}-${key}`">{{ label }}</label></legend><textarea :id="`${fieldId}-${key}`" class="textarea textarea-bordered w-full" rows="3" :value="(policy[key] || []).join('\n')" @change="list(key, $event.target.value)" /><span class="mt-1 text-xs opacity-60">{{ hint }}</span></fieldset>
      <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-3`">{{ tr("数据起始时间") }}</label></legend><SystemDateTimeInput :id="`${formFieldId}-3`" class="input input-bordered w-full" :model-value="dateValues.from_at" @update:model-value="date('from_at', $event)" /></fieldset>
      <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-4`">{{ tr("数据结束时间（不含）") }}</label></legend><SystemDateTimeInput :id="`${formFieldId}-4`" class="input input-bordered w-full" :model-value="dateValues.to_at" @update:model-value="date('to_at', $event)" /></fieldset>
    </div>
    <div><p class="mb-2 text-sm font-medium">{{ tr("扫描模式") }}</p><div class="flex flex-wrap gap-4"><label v-for="[id, label] in [[&#39;port_only&#39;, tr(&quot;端口发现&quot;)], [&#39;service_inventory&#39;, tr(&quot;服务识别&quot;)], [&#39;dns_records&#39;, tr(&quot;仅 DNS&quot;)], [&#39;vulnerability_scan&#39;, tr(&quot;漏洞扫描&quot;)]]" :key="id" class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox checkbox-sm" :checked="policy.profiles?.includes(id)" @change="toggle('profiles', id, $event.target.checked)" />{{ label }}</label></div></div>
    <details class="rounded-lg border border-base-300 p-3"><summary class="cursor-pointer text-sm font-medium">{{ tr("配额设置") }}</summary><div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><fieldset v-for="[key, label, max] in limits" :key="key" class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-5-${key}`">{{ label }}</label></legend><input :id="`${formFieldId}-5-${key}`" type="number" min="1" :max="max" class="input input-bordered input-sm w-full" :value="policy[key]" @change="update(key, Number($event.target.value))" /></fieldset></div></details>
  </fieldset>
</template>
