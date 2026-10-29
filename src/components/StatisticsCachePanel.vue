<script setup>
import { tr } from '../i18n/index.js'

import { onBeforeUnmount, onMounted, ref } from 'vue'
import http from '@/utils/http'
import { cacheDefaults, cacheFields } from '@/utils/statisticsCache'
import { formatDateTime } from '../i18n/time.js'

const props = defineProps({ modelValue: { type: Object, required: true }, revision: { type: Number, required: true }, dirty: Boolean })
const emit = defineEmits(['update:modelValue', 'cleared'])
const status = ref(null)
const error = ref('')
const message = ref('')
const loading = ref(false)
const clearing = ref(false)
let timer, controller
let disposed = false
function update(key, value) { emit('update:modelValue', { ...props.modelValue, [key]: value }) }
async function refresh() {
  clearTimeout(timer)
  if (disposed || document.hidden || loading.value) return
  controller = new AbortController()
  loading.value = true
  try {
    const response = await http.get('/api/analysis/statistics/cache', { signal: controller.signal })
    if (!disposed) { status.value = response.data.data; error.value = '' }
  } catch (e) {
    if (!disposed && !controller.signal.aborted) error.value = e.response?.data?.message || tr("缓存状态读取失败")
  } finally {
    loading.value = false
    if (!disposed && !document.hidden) timer = setTimeout(refresh, 30000)
  }
}
async function clearCache() {
  if (clearing.value || props.dirty) return
  clearing.value = true
  message.value = ''
  try {
    const response = await http.post('/api/analysis/statistics/cache/clear', { expected_revision: props.revision })
    if (disposed) return
    emit('cleared', response.data.data)
    message.value = tr("缓存已清理；其他实例通常在 5 秒内同步，后续访问按需重新计算。")
    await refresh()
  } catch (e) { if (!disposed) error.value = e.response?.data?.message || tr("清理失败，请重试") }
  finally { clearing.value = false }
}
function visibilityChanged() { clearTimeout(timer); if (!document.hidden) refresh() }
onMounted(() => { refresh(); document.addEventListener('visibilitychange', visibilityChanged) })
onBeforeUnmount(() => { disposed = true; clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', visibilityChanged) })
</script>

<template>
  <section class="space-y-4 rounded-lg border border-base-300 p-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div><h4 class="font-semibold">{{ tr("统计查询与结果缓存") }}</h4><p class="mt-1 text-xs opacity-60">{{ tr("复用相同条件下的统计结果，减少重复计算。分组上限适用于实时、快照和任务历史统计；调高会增加资源消耗。关闭缓存后仍保留计算限制。") }}</p></div>
      <button type="button" class="btn btn-ghost btn-sm" @click="emit('update:modelValue', { ...cacheDefaults })">{{ tr("恢复默认值") }}</button>
    </div>
    <label class="flex items-center gap-3 text-sm"><input type="checkbox" class="toggle toggle-sm" :checked="modelValue.enabled" @change="update('enabled', $event.target.checked)" />{{ tr("启用结果缓存") }}</label>
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <fieldset v-for="field in cacheFields" :key="field.key" class="fieldset min-w-0">
        <legend class="fieldset-legend"><label :for="`cache-${field.key}`">{{ field.label }}</label></legend>
        <input :id="`cache-${field.key}`" type="number" class="input input-bordered w-full" :value="modelValue[field.key]" :min="status?.limits?.[field.key]?.[0] ?? field.min" :max="status?.limits?.[field.key]?.[1] ?? field.max" step="1" @input="update(field.key, $event.target.value === '' ? '' : Number($event.target.value))" />
        <p class="label opacity-60">{{ status?.limits?.[field.key]?.[0] ?? field.min }}～{{ status?.limits?.[field.key]?.[1] ?? field.max }}</p>
      </fieldset>
    </div>
    <p class="text-xs opacity-60">{{ tr("修改后点击页面下方“保存更改”。发布新配置会清理旧缓存，容量按每个服务实例计算。") }}</p>
  </section>
  <section class="min-w-0 space-y-3 rounded-lg border border-base-300 p-4">
    <div class="flex flex-wrap items-center justify-between gap-3"><h4 class="font-semibold">{{ tr("缓存运行状态") }}</h4><div class="flex gap-2"><button type="button" class="btn btn-sm btn-ghost" :disabled="loading" @click="refresh">{{ tr("刷新状态") }}</button><button type="button" class="btn btn-sm btn-outline" :disabled="clearing || dirty || !revision" @click="clearCache">{{ clearing ? tr("清理中…") : tr("清空统计缓存") }}</button></div></div>
    <p v-if="dirty" class="text-xs text-warning">{{ tr("请先保存或重新加载配置，再清理缓存。") }}</p>
    <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p><p v-if="message" role="status" class="text-sm text-success">{{ message }}</p>
    <div v-if="status" class="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <div class="rounded-lg bg-base-200/40 p-3"><p class="text-xs opacity-60">{{ tr("当前条目") }}</p><p class="mt-1 text-xl font-semibold">{{ status.current.entries }}</p></div>
      <div class="rounded-lg bg-base-200/40 p-3"><p class="text-xs opacity-60">{{ tr("占用容量") }}</p><p class="mt-1 text-xl font-semibold">{{ (status.current.bytes / 1048576).toFixed(2) }} <span class="text-xs">MiB</span></p></div>
      <div class="rounded-lg bg-base-200/40 p-3"><p class="text-xs opacity-60">{{ tr("命中率") }}</p><p class="mt-1 text-xl font-semibold">{{ status.current.hit_rate == null ? '--' : `${status.current.hit_rate.toFixed(1)}%` }}</p></div>
      <div class="rounded-lg bg-base-200/40 p-3"><p class="text-xs opacity-60">{{ tr("运行 / 在途查询") }}</p><p class="mt-1 text-xl font-semibold">{{ status.current.running }} / {{ status.current.in_flight }}</p></div>
    </div>
    <template v-if="status">
      <p class="break-all text-xs opacity-60">{{ tr("当前实例") }} {{ status.current.instance_id }} {{ tr("· 配置 #") }}{{ status.current.revision }} {{ tr("· 淘汰") }} {{ status.current.evictions }} {{ tr("次 · 拒绝") }} {{ status.current.rejected }} {{ tr("次 · 合并") }} {{ status.current.joined }} {{ tr("次") }}</p>
      <p class="text-xs opacity-60">{{ tr("最近清理：") }}{{ status.current.last_cleared_at ? formatDateTime(status.current.last_cleared_at) : '--' }}{{ tr("。计数从实例启动累计；状态每 30 秒刷新。") }}</p>
      <div class="overflow-x-auto"><table class="table table-sm whitespace-nowrap"><thead><tr><th>{{ tr("近期服务实例") }}</th><th>{{ tr("配置版本") }}</th><th>{{ tr("同步状态") }}</th><th>{{ tr("最后上报") }}</th></tr></thead><tbody><tr v-for="instance in status.instances" :key="instance.status.instance_id"><td class="font-mono text-xs">{{ instance.status.instance_id }}</td><td>#{{ instance.status.revision }}</td><td><span class="badge badge-sm" :class="instance.status.revision === status.current.revision ? 'badge-ghost' : 'badge-warning'">{{ instance.status.revision === status.current.revision ? tr("已同步") : tr("待同步") }}</span></td><td>{{ formatDateTime(instance.updated_at) }}</td></tr></tbody></table></div>
    </template>
  </section>
</template>
