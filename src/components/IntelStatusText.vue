<script setup>
defineProps({ text: { type: String, default: '' } })
</script>

<template>
  <span class="status-text">
    <Transition name="status-fade">
      <span :key="text">{{ text }}</span>
    </Transition>
  </span>
</template>

<style scoped>
.status-text {
  display: inline-grid;
  align-items: start;
  vertical-align: bottom;
  min-height: 1lh;
}

.status-text > * {
  grid-area: 1 / 1;
}

.status-fade-enter-active,
.status-fade-leave-active {
  transition: opacity 200ms ease;
}

.status-fade-enter-from,
.status-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .status-fade-enter-active,
  .status-fade-leave-active {
    transition: none;
  }
}
</style>
