<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({ loading: Boolean })
const emit = defineEmits(['refresh'])
const visible = ref(false)
let timer, shownAt = 0

watch(() => props.loading, (loading) => {
  clearTimeout(timer)
  if (loading) {
    if (!visible.value) timer = setTimeout(() => {
      visible.value = true
      shownAt = Date.now()
    }, 150)
  } else if (visible.value) {
    timer = setTimeout(() => { visible.value = false }, Math.max(0, 400 - (Date.now() - shownAt)))
  }
}, { immediate: true, flush: 'sync' })

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <button
    type="button"
    class="btn btn-sm min-w-24"
    :aria-disabled="loading"
    :aria-busy="loading"
    @click="!loading && emit('refresh')"
  >
    <span class="refresh-content">
      <Transition name="refresh-fade">
        <span v-if="visible" key="loading" class="inline-flex items-center justify-center gap-2">
          <span class="loading loading-spinner loading-xs motion-reduce:animate-none" aria-hidden="true"></span>
          刷新中
        </span>
        <span v-else key="ready">刷新</span>
      </Transition>
    </span>
  </button>
</template>

<style scoped>
.refresh-content {
  display: inline-grid;
  align-items: center;
  justify-items: center;
}

.refresh-content > * {
  grid-area: 1 / 1;
}

.refresh-fade-enter-active,
.refresh-fade-leave-active {
  transition: opacity 180ms ease;
}

.refresh-fade-enter-from,
.refresh-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .refresh-fade-enter-active,
  .refresh-fade-leave-active {
    transition: none;
  }
}
</style>
