<script setup>
import { computed } from 'vue'

const props = defineProps({
  tags: {
    type: Array,
    default: () => [],
  },
  limit: {
    type: Number,
    default: 0,
  },
  size: {
    type: String,
    default: 'sm',
  },
})

const visibleTags = computed(() => props.limit > 0 ? props.tags.slice(0, props.limit) : props.tags)
const hiddenCount = computed(() => Math.max(0, props.tags.length - visibleTags.value.length))

function tagClass(tag) {
  if (tag.kind === 'malicious') return 'badge-error'
  if (tag.kind === 'benign') return 'badge-success'
  return 'badge-info'
}
</script>

<template>
  <span v-if="tags.length" class="inline-flex flex-wrap items-center gap-1">
    <span
      v-for="tag in visibleTags"
      :key="tag.id"
      class="badge rounded"
      :class="[tagClass(tag), size === 'xs' ? 'badge-xs' : 'badge-sm']"
      :title="tag.description || tag.name"
    >
      {{ tag.name }}
    </span>
    <span v-if="hiddenCount" class="badge badge-ghost" :class="size === 'xs' ? 'badge-xs' : 'badge-sm'">
      +{{ hiddenCount }}
    </span>
  </span>
</template>
