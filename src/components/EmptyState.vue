<script setup>
import { computed } from 'vue'
import { CircleAlert, CircleX } from '@lucide/vue'

const props = defineProps({
  type: {
    type: String,
    default: 'info',
    validator: (value) => ['info', 'error'].includes(value),
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    default: '',
  },
})

const titleClass = computed(() => (props.type === 'error' ? 'text-error' : 'text-base-content/60'))
const detailClass = computed(() => (props.type === 'error' ? 'text-error/75' : 'text-base-content/45'))
</script>

<template>
  <div class="grid min-h-80 place-items-center rounded-lg bg-base-200/60 p-6">
    <div class="max-w-xl text-center">
      <div class="inline-flex items-center justify-center gap-2">
        <CircleX
          v-if="type === 'error'"
          class="size-5 shrink-0"
          :class="titleClass"
        />

        <CircleAlert
          v-else
          class="size-5 shrink-0"
          :class="detailClass"
        />

        <div class="text-base font-semibold" :class="titleClass">{{ title }}</div>
      </div>

      <p v-if="message" class="mt-1 whitespace-pre-line text-xs" :class="detailClass">
        {{ message }}
      </p>
    </div>
  </div>
</template>
