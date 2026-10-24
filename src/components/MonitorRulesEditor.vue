<script setup>
import { tr } from '../i18n/index.js'

import { computed, ref, watch } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import { clonePolicy, effectiveRule, monitorServices, operationKey, validateSlowRule } from '@/utils/monitorRules'

const props = defineProps({
  modelValue: { type: Object, required: true },
  savedDocument: { type: Object, default: null },
  catalogue: { type: Array, default: () => [] },
  loading: Boolean,
  error: { type: String, default: '' },
  sqlMessage: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'reload'])
const serviceFilter = ref('')
const stateFilter = ref('')
const search = ref('')
const page = ref(1)
const pageSize = 15
const expandedDescriptions = ref(new Set())

const rows = computed(() => props.catalogue.map((operation) => {
  const value = effectiveRule(props.modelValue, operation)
  const previous = props.savedDocument ? effectiveRule(props.savedDocument, operation) : value
  return { ...operation, ...value, dirty: JSON.stringify(value) !== JSON.stringify(previous), error: validateSlowRule(value.rule) }
}).filter((row) => {
  if (serviceFilter.value && row.service !== serviceFilter.value) return false
  if (stateFilter.value === 'disabled' && row.rule.enabled) return false
  if (stateFilter.value === 'override' && row.mode !== 'override') return false
  if (stateFilter.value === 'inherit' && row.mode !== 'inherit') return false
  const query = search.value.trim().toLowerCase()
  return !query || `${row.label} ${row.operation}`.toLowerCase().includes(query)
}))
const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize)))
const visibleRows = computed(() => rows.value.slice((page.value - 1) * pageSize, page.value * pageSize))
watch([serviceFilter, stateFilter, search], () => { page.value = 1 })
watch(pageCount, (count) => { page.value = Math.min(page.value, count) })

function updateDefault(service, field, value) {
  const document = clonePolicy(props.modelValue)
  document.service_defaults[service][field] = value
  emit('update:modelValue', document)
}

function overrideOperation(operation) {
  const document = clonePolicy(props.modelValue)
  document.operation_rules.push({ service: operation.service, operation: operation.operation, rule: clonePolicy(operation.rule) })
  emit('update:modelValue', document)
}

function restoreInheritance(operation) {
  const document = clonePolicy(props.modelValue)
  document.operation_rules = document.operation_rules.filter((item) => operationKey(item) !== operationKey(operation))
  emit('update:modelValue', document)
}

function updateOperation(operation, field, value) {
  const document = clonePolicy(props.modelValue)
  const item = document.operation_rules.find((item) => operationKey(item) === operationKey(operation))
  if (!item) return
  item.rule[field] = value
  emit('update:modelValue', document)
}

function numeric(event, nullable = false) {
  return event.target.value === '' ? (nullable ? null : '') : Number(event.target.value)
}

function serviceLabel(key) {
  return monitorServices.find((item) => item.key === key)?.label || key
}

function toggleDescription(row) {
  const key = operationKey(row)
  if (expandedDescriptions.value.has(key)) expandedDescriptions.value.delete(key)
  else expandedDescriptions.value.add(key)
}
</script>

<template>
  <div class="min-w-0 space-y-5">
    <section class="rounded-lg border border-base-300 p-4">
      <h4 class="font-semibold">{{ tr("服务默认规则") }}</h4>
      <p class="mt-1 text-xs opacity-60">{{ tr("未单独覆盖的操作使用对应服务默认值。严重阈值留空时只产生耗时警告；错误告警独立判定。") }}</p>
      <div class="mt-3 grid gap-3 xl:grid-cols-2">
        <div v-for="service in monitorServices" :key="service.key" class="rounded-lg border border-base-300 p-3">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h5 class="font-medium">{{ service.label }}</h5>
            <label class="flex items-center gap-2 text-xs"><input type="checkbox" class="toggle toggle-sm" :aria-label="tr(&quot;{0}默认慢检测&quot;, [service.label])" :checked="modelValue.service_defaults[service.key].enabled" @change="updateDefault(service.key, 'enabled', $event.target.checked)" />{{ tr("慢检测") }}</label>
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">{{ tr("警告（ms）") }}</legend><input type="number" class="input input-bordered input-sm w-full" min="1" max="86400000" step="1" :aria-label="tr(&quot;{0}默认警告阈值&quot;, [service.label])" :value="modelValue.service_defaults[service.key].warning_threshold_ms" @input="updateDefault(service.key, 'warning_threshold_ms', numeric($event))" /></fieldset>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">{{ tr("严重（ms，可留空）") }}</legend><input type="number" class="input input-bordered input-sm w-full" min="1" max="86400000" step="1" :placeholder="tr(&quot;未启用&quot;)" :aria-label="tr(&quot;{0}默认严重阈值&quot;, [service.label])" :value="modelValue.service_defaults[service.key].critical_threshold_ms" @input="updateDefault(service.key, 'critical_threshold_ms', numeric($event, true))" /></fieldset>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">{{ tr("冷却（秒）") }}</legend><input type="number" class="input input-bordered input-sm w-full" min="1" max="604800" step="1" :aria-label="tr(&quot;{0}默认冷却时间&quot;, [service.label])" :value="modelValue.service_defaults[service.key].cooldown_seconds" @input="updateDefault(service.key, 'cooldown_seconds', numeric($event))" /></fieldset>
          </div>
          <p v-if="validateSlowRule(modelValue.service_defaults[service.key])" class="mt-2 text-xs text-error">{{ validateSlowRule(modelValue.service_defaults[service.key]) }}</p>
        </div>
      </div>
    </section>

    <section class="space-y-3 rounded-lg border border-base-300 p-4">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div><h4 class="font-semibold">{{ tr("操作覆盖规则") }}</h4><p class="mt-1 text-xs opacity-60">{{ tr("操作覆盖优先于服务默认规则。恢复继承后使用当前默认值，所有修改在保存后生效。") }}</p></div>
        <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" @click="emit('reload')">{{ tr("刷新操作目录") }}</button>
      </div>
      <p class="text-xs opacity-60">{{ tr("同一操作的重复同级告警在冷却期内合并；升级为严重时立即通知。冷却不影响耗时采集。") }}</p>
      <div v-if="sqlMessage" role="status" class="alert alert-warning text-sm">{{ sqlMessage }}</div>
      <div class="grid gap-2 sm:grid-cols-3">
        <select v-model="serviceFilter" class="select select-bordered w-full" :aria-label="tr(&quot;筛选服务&quot;)"><option value="">{{ tr("全部服务") }}</option><option v-for="service in monitorServices" :key="service.key" :value="service.key">{{ service.label }}</option></select>
        <select v-model="stateFilter" class="select select-bordered w-full" :aria-label="tr(&quot;筛选规则状态&quot;)"><option value="">{{ tr("全部规则状态") }}</option><option value="inherit">{{ tr("继承默认") }}</option><option value="override">{{ tr("操作覆盖") }}</option><option value="disabled">{{ tr("慢检测关闭") }}</option></select>
        <input v-model="search" type="search" class="input input-bordered w-full" :placeholder="tr(&quot;搜索中文名称或操作标识&quot;)" :aria-label="tr(&quot;搜索操作&quot;)" />
      </div>
      <div v-if="loading" class="flex items-center gap-2 py-6 text-sm opacity-60"><span class="loading loading-spinner loading-sm"></span>{{ tr("正在加载操作目录...") }}</div>
      <div v-else-if="error" class="alert alert-error" role="alert">{{ error }}<button type="button" class="btn btn-sm" @click="emit('reload')">{{ tr("重试") }}</button></div>
      <EmptyState v-else-if="!rows.length" :title="tr(&quot;没有匹配的操作&quot;)" :message="tr(&quot;尝试调整服务、规则状态或搜索条件。&quot;)" />
      <div v-else class="min-w-0 w-full overflow-x-auto rounded-lg border border-base-300">
        <table class="table table-sm">
          <thead><tr><th>{{ tr("服务") }}</th><th>{{ tr("操作") }}</th><th>{{ tr("警告阈值（ms）") }}</th><th>{{ tr("严重阈值（ms）") }}</th><th>{{ tr("冷却（秒）") }}</th><th>{{ tr("继承／覆盖") }}</th><th>{{ tr("启用状态") }}</th></tr></thead>
          <tbody>
            <tr v-for="row in visibleRows" :key="operationKey(row)">
              <td class="whitespace-nowrap">{{ serviceLabel(row.service) }}</td>
              <td class="min-w-52">
                <span class="block font-medium">{{ row.label }}</span>
                <code class="block break-all text-xs opacity-60">{{ row.operation }}</code>
                <div class="mt-1 text-xs opacity-60">
                  <button type="button" class="inline-flex cursor-pointer items-center gap-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2" :aria-expanded="expandedDescriptions.has(operationKey(row))" :aria-controls="`monitor-description-${operationKey(row)}`" @click="toggleDescription(row)">
                    <span aria-hidden="true" class="transition-transform duration-200 motion-reduce:transition-none" :class="{ 'rotate-90': expandedDescriptions.has(operationKey(row)) }">▸</span> {{ tr("说明") }} </button>
                  <div :id="`monitor-description-${operationKey(row)}`" class="operation-description" :class="{ 'operation-description-open': expandedDescriptions.has(operationKey(row)) }" :inert="!expandedDescriptions.has(operationKey(row))">
                    <div class="min-h-0 overflow-hidden"><p class="mt-1">{{ row.description }}</p></div>
                  </div>
                </div>
                <span v-if="row.dirty" class="badge badge-warning badge-xs mt-1">{{ tr("未保存") }}</span>
                <p v-if="row.error" class="mt-1 text-xs text-error">{{ row.error }}</p>
              </td>
              <td><input v-if="row.mode === 'override'" type="number" class="input input-bordered input-sm w-28" min="1" max="86400000" :aria-label="tr(&quot;{0}警告阈值&quot;, [row.operation])" :value="row.rule.warning_threshold_ms" @input="updateOperation(row, 'warning_threshold_ms', numeric($event))" /><span v-else>{{ row.rule.warning_threshold_ms }}</span></td>
              <td><input v-if="row.mode === 'override'" type="number" class="input input-bordered input-sm w-28" min="1" max="86400000" :placeholder="tr(&quot;未启用&quot;)" :aria-label="tr(&quot;{0}严重阈值&quot;, [row.operation])" :value="row.rule.critical_threshold_ms" @input="updateOperation(row, 'critical_threshold_ms', numeric($event, true))" /><span v-else>{{ row.rule.critical_threshold_ms ?? tr("未启用") }}</span></td>
              <td><input v-if="row.mode === 'override'" type="number" class="input input-bordered input-sm w-24" min="1" max="604800" :aria-label="tr(&quot;{0}冷却时间&quot;, [row.operation])" :value="row.rule.cooldown_seconds" @input="updateOperation(row, 'cooldown_seconds', numeric($event))" /><span v-else>{{ row.rule.cooldown_seconds }}</span></td>
              <td class="min-w-32"><span class="block text-xs">{{ row.mode === 'override' ? tr("操作覆盖") : tr("继承{0}默认", [serviceLabel(row.service)]) }}</span><button v-if="row.mode === 'inherit'" type="button" class="btn btn-ghost btn-xs mt-1" @click="overrideOperation(row)">{{ tr("设置覆盖") }}</button><button v-else type="button" class="btn btn-ghost btn-xs mt-1" @click="restoreInheritance(row)">{{ tr("恢复继承") }}</button></td>
              <td><label v-if="row.mode === 'override'" class="flex items-center gap-2 text-xs"><input type="checkbox" class="toggle toggle-sm" :aria-label="tr(&quot;{0}慢检测&quot;, [row.operation])" :checked="row.rule.enabled" @change="updateOperation(row, 'enabled', $event.target.checked)" />{{ row.rule.enabled ? tr("开启") : tr("关闭") }}</label><span v-else class="badge badge-sm" :class="row.rule.enabled ? 'badge-success' : 'badge-ghost'">{{ row.rule.enabled ? tr("开启") : tr("关闭") }} {{ tr("· 默认") }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="!loading && !error && rows.length" class="flex items-center justify-between gap-2 text-xs opacity-70"><span>{{ tr("共") }} {{ rows.length }} {{ tr("个操作 · 第") }} {{ page }} / {{ pageCount }} {{ tr("页") }}</span><div class="flex gap-2"><button type="button" class="btn btn-ghost btn-xs" :disabled="page <= 1" @click="page--">{{ tr("上一页") }}</button><button type="button" class="btn btn-ghost btn-xs" :disabled="page >= pageCount" @click="page++">{{ tr("下一页") }}</button></div></div>
    </section>
  </div>
</template>

<style scoped>
.operation-description {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 200ms ease, opacity 200ms ease;
}

.operation-description-open {
  grid-template-rows: 1fr;
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .operation-description {
    transition: none;
  }
}
</style>
