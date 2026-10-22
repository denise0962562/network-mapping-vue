<script setup>
import { computed, ref } from 'vue'
import { Database } from '@lucide/vue'
import { technologyLabel } from '@/utils/webDetection'
import { webTechnologyIcon } from '@/utils/webTechnologyIcons'

const props = defineProps({ technology: { type: Object, required: true } })
const failedSource = ref('')
const source = computed(() => webTechnologyIcon(props.technology.id))
const icon = computed(() => failedSource.value === source.value ? webTechnologyIcon(null) : source.value)
</script>

<template>
  <span class="inline-flex max-w-full items-center gap-1 align-middle">
    <Database v-if="technology.category === 'database'" class="size-[18px] shrink-0" aria-hidden="true" />
    <img v-else :src="icon" alt="" aria-hidden="true" width="18" height="18"
      class="size-[18px] shrink-0 rounded-sm bg-white p-px object-contain"
      decoding="async" @error="failedSource = source">
    <span class="break-words">{{ technologyLabel(technology) }}</span>
    <span v-if="technology.category === 'database'" class="badge badge-outline badge-sm shrink-0">数据库</span>
  </span>
</template>
