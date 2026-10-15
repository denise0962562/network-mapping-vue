<script setup>
import { computed } from 'vue'
import SystemDateTimeInput from './SystemDateTimeInput.vue'
import { localToIso, toLocalInputValue } from '../utils/systemTime'

const props = defineProps({ modelValue: { type: Object, required: true }, catalog: { type: Object, required: true }, disabled: Boolean })
const emit = defineEmits(['update:modelValue'])
const policy = computed(() => props.modelValue)
function update(key, value) { emit('update:modelValue', { ...props.modelValue, [key]: value }) }
function toggle(key, value, checked) {
  const items = new Set(props.modelValue[key] || [])
  if (checked) items.add(value); else items.delete(value)
  update(key, [...items])
}
function list(key, value) { update(key, [...new Set(value.split(/[\n,]+/).map(v => v.trim()).filter(Boolean))]) }
function date(key, value) { update(key, value ? new Date(localToIso(value)).getTime() : null) }
const limits = [
  ['requests_per_minute', '每分钟调用', 1000000], ['requests_per_day', '每日调用', 1000000],
  ['searches_per_minute', '每分钟搜索', 1000000], ['statistics_per_minute', '每分钟统计', 1000000],
  ['tasks_per_minute', '每分钟扫描', 1000000], ['tasks_per_day', '每日扫描', 1000000],
  ['max_running_tasks', '未完成扫描任务', 1000000], ['max_targets', '每任务最多地址', 65536],
  ['max_ports', '每任务最多端口', 65535], ['exports_per_day', '每日导出或报告', 1000000],
  ['max_export_rows', '每次导出最多行', 50000], ['max_webhooks', '最多事件订阅', 1000000],
]
const scopeNames = {
  'metadata:read': '接入信息', 'assets:read': '资产查询', 'assets:refresh': '刷新资产', 'observations:read': '历史观察',
  'dns:read': 'DNS 数据', 'vulnerabilities:read': '漏洞观察', 'vulnerabilities:evidence': '漏洞详细证据',
  'tags:read': '授权标签', 'annotations:read': '读取注释', 'annotations:write': '维护注释',
  'tasks:read': '任务结果', 'tasks:create': '创建扫描', 'tasks:cancel': '取消扫描', 'tasks:retry': '重试扫描',
  'analytics:read': '统计分析', 'reports:read': '读取报告', 'reports:create': '生成报告',
  'exports:read': '读取导出', 'exports:create': '创建导出', 'events:read': '读取事件', 'webhooks:manage': '事件订阅',
  'saved_searches:manage': '保存查询',
}
</script>

<template>
  <fieldset :disabled="disabled" class="space-y-5">
    <div class="grid gap-4 md:grid-cols-2">
      <label class="form-control"><span class="label-text mb-2">可见数据</span><select class="select select-bordered w-full" :value="policy.data_mode" @change="update('data_mode', $event.target.value)"><option value="application">仅此应用创建的扫描</option><option value="owner">责任用户的已有数据</option></select><span class="mt-1 text-xs opacity-60">仍受目标、时间和字段范围限制。</span></label>
      <label class="form-control"><span class="label-text mb-2">批准标签 ID</span><input class="input input-bordered" :value="(policy.tag_ids || []).join(', ')" placeholder="如 1, 2（空表示不开放标签目录）" @change="update('tag_ids', $event.target.value.split(',').map(v => Number(v.trim())).filter(v => v > 0))" /></label>
    </div>
    <div><p class="mb-2 text-sm font-medium">功能权限</p><div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><label v-for="scope in catalog.scopes || []" :key="scope" class="flex items-start gap-2 rounded-lg border border-base-300 p-2 text-sm"><input type="checkbox" class="checkbox checkbox-sm mt-0.5" :checked="policy.scopes?.includes(scope)" @change="toggle('scopes', scope, $event.target.checked)" /><span>{{ scopeNames[scope] || scope }}<span class="block text-xs opacity-50">{{ scope }}</span></span></label></div></div>
    <div><p class="mb-2 text-sm font-medium">可返回字段</p><div class="flex flex-wrap gap-3"><label v-for="field in catalog.fields || []" :key="field" class="flex items-center gap-1 text-xs"><input class="checkbox checkbox-xs" type="checkbox" :checked="policy.fields?.includes(field)" @change="toggle('fields', field, $event.target.checked)" />{{ field }}</label></div></div>
    <div class="grid gap-4 md:grid-cols-2">
      <label v-for="[key, label, hint] in [['cidrs', '允许 IP/CIDR', '读取为空时沿用所属数据；提交 IP 扫描必须明确授权'], ['excluded_cidrs', '排除 IP/CIDR', '扫描与排除网段相交时拒绝整个目标'], ['domains', '允许域名', '按标签边界允许子域名；域名扫描必须明确授权'], ['ip_allowlist', '调用来源 CIDR', '为空表示不附加来源限制'] ]" :key="key" class="form-control"><span class="label-text mb-1">{{ label }}</span><textarea class="textarea textarea-bordered" rows="3" :value="(policy[key] || []).join('\n')" @change="list(key, $event.target.value)" /><span class="mt-1 text-xs opacity-60">{{ hint }}</span></label>
      <label class="form-control"><span class="label-text mb-1">数据起始时间</span><SystemDateTimeInput class="input input-bordered w-full" :model-value="policy.from_at ? toLocalInputValue(policy.from_at) : ''" @update:model-value="date('from_at', $event)" /></label>
      <label class="form-control"><span class="label-text mb-1">数据结束时间（不含）</span><SystemDateTimeInput class="input input-bordered w-full" :model-value="policy.to_at ? toLocalInputValue(policy.to_at) : ''" @update:model-value="date('to_at', $event)" /></label>
    </div>
    <div><p class="mb-2 text-sm font-medium">扫描模式</p><div class="flex flex-wrap gap-4"><label v-for="[id, label] in [['port_only', '端口发现'], ['service_inventory', '服务识别'], ['dns_records', '仅 DNS'], ['vulnerability_scan', '漏洞扫描']]" :key="id" class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox checkbox-sm" :checked="policy.profiles?.includes(id)" @change="toggle('profiles', id, $event.target.checked)" />{{ label }}</label></div></div>
    <details class="rounded-lg border border-base-300 p-3"><summary class="cursor-pointer text-sm font-medium">配额设置</summary><div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label v-for="[key, label, max] in limits" :key="key" class="form-control"><span class="label-text mb-1">{{ label }}</span><input type="number" min="1" :max="max" class="input input-bordered input-sm" :value="policy[key]" @change="update(key, Number($event.target.value))" /></label></div></details>
  </fieldset>
</template>
