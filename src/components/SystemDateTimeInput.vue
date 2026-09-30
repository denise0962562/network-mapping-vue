<script setup>
import { computed, ref, watch, watchEffect } from 'vue'
import { localTimeCandidates, localToIso, offsetLabel, timeSettings, toLocalInputValue } from '@/utils/systemTime'

defineOptions({ inheritAttrs: false })
const props = defineProps({ modelValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue', 'change'])
const input = ref(null)
const local = computed(() => props.modelValue.split('@')[0])
const candidates = computed(() => localTimeCandidates(local.value))
const error = computed(() => {
  if (!props.modelValue) return ''
  try { localToIso(props.modelValue); return '' } catch (e) { return e.message }
})
watchEffect(() => input.value?.setCustomValidity(error.value))
watch(() => timeSettings.timezone, (_zone, oldZone) => {
  if (!props.modelValue) return
  try { change(toLocalInputValue(localToIso(props.modelValue, oldZone))) } catch { change('') }
})
function change(value) { emit('update:modelValue', value); emit('change') }
</script>

<template>
  <span class="inline-flex min-w-0 flex-col gap-1">
    <input ref="input" v-bind="$attrs" type="datetime-local" :value="local" @input="change($event.target.value)" />
    <span class="text-xs opacity-60">{{ timeSettings.timezone }}</span>
    <select v-if="candidates.length > 1" class="select select-bordered select-xs" :value="modelValue.split('@')[1] || ''" aria-label="重复时间的 UTC 偏移" @change="change(`${local}@${$event.target.value}`)">
      <option value="" disabled>请选择 UTC 偏移</option>
      <option v-for="candidate in candidates" :key="candidate.timestamp" :value="candidate.timestamp">{{ offsetLabel(candidate.offset) }}</option>
    </select>
    <span v-if="error" class="text-xs text-error">{{ error }}</span>
  </span>
</template>
