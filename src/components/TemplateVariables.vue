<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  variables: { type: Array, default: () => [] },
  disabled: Boolean,
})
const emit = defineEmits(['insert'])
const query = ref('')
const filteredVariables = computed(() => {
  const term = query.value.trim().toLowerCase()
  return props.variables.filter(variable => !term || [variable.key, variable.label, variable.example]
    .some(value => String(value ?? '').toLowerCase().includes(term)))
})
</script>

<template>
  <section class="template-variables min-w-0">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-sm font-semibold">模板变量</h3>
      <span class="text-xs opacity-60">{{ filteredVariables.length }} / {{ variables.length }} 项</span>
    </div>
    <p class="mt-1 text-xs opacity-60">点击插入当前编辑位置；可按变量名、说明或示例搜索。</p>
    <input v-model="query" type="search" aria-label="搜索模板变量" placeholder="搜索模板变量" class="input input-sm mt-3 min-w-0 w-full max-w-full" />
    <ul v-if="filteredVariables.length" class="variable-list mt-3 grid min-w-0 gap-2 overflow-y-auto overscroll-contain pr-1" tabindex="0" aria-label="模板变量列表">
      <li v-for="variable in filteredVariables" :key="variable.key" class="min-w-0">
        <button type="button" class="min-w-0 w-full max-w-full rounded-lg border border-base-300 p-3 text-left transition hover:bg-base-200" :disabled="disabled" :title="`${variable.key} · ${variable.label}\n示例：${variable.example ?? ''}`" @click="emit('insert', variable.key)">
          <code class="break-all text-xs text-primary" v-text="`{{ ${variable.key} }}`"></code>
          <span class="mt-1 block break-all text-xs">{{ variable.label }}</span>
          <span class="mt-1 line-clamp-2 break-all text-xs opacity-50">示例：{{ variable.example }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="mt-3 py-4 text-center text-xs opacity-60">{{ variables.length ? '没有匹配的变量。' : '当前模板暂无变量。' }}</p>
  </section>
</template>

<style scoped>
.template-variables {
  container: template-variables / inline-size;
}

.variable-list {
  grid-template-columns: minmax(0, 1fr);
  max-height: 16rem;
}

@container template-variables (min-width: 30rem) {
  .variable-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-height: 20rem;
  }
}
</style>
