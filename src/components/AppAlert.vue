<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  type: {
    type: String,
    default: 'info',
    validator: (value) => ['info', 'success', 'warning', 'error'].includes(value),
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  closable: {
    type: Boolean,
    default: true,
  },
  timeout: {
    type: Number,
    default: 7000,
  },
})

const emit = defineEmits(['close'])

const alertConfig = {
  info: {
    alertClass: 'alert-info',
    iconClass: 'text-info',
  },
  success: {
    alertClass: 'alert-success',
    iconClass: 'text-success',
  },
  warning: {
    alertClass: 'alert-warning',
    iconClass: 'text-warning',
  },
  error: {
    alertClass: 'alert-error',
    iconClass: 'text-error',
  },
}

const currentConfig = computed(() => alertConfig[props.type] ?? alertConfig.info)

const remainingTime = ref(props.timeout)
const pauseLocks = new Set()
let timeoutId = null
let timerStartedAt = 0

function clearAlertTimer() {
  if (timeoutId === null) return
  clearTimeout(timeoutId)
  timeoutId = null
}

function startAlertTimer() {
  if (props.timeout <= 0 || remainingTime.value <= 0) return
  clearAlertTimer()
  timerStartedAt = Date.now()
  timeoutId = setTimeout(() => {
    emit('close')
  }, remainingTime.value)
}

function pauseAlertTimer(reason) {
  pauseLocks.add(reason)
  if (timeoutId === null) return

  remainingTime.value = Math.max(0, remainingTime.value - (Date.now() - timerStartedAt))
  clearAlertTimer()
}

function resumeAlertTimer(reason) {
  pauseLocks.delete(reason)
  if (pauseLocks.size > 0) return

  startAlertTimer()
}

function handleClose() {
  clearAlertTimer()
  emit('close')
}

onMounted(() => {
  startAlertTimer()
})

onBeforeUnmount(() => {
  clearAlertTimer()
})
</script>

<template>
  <div class="flex w-full max-w-[calc(100vw-2rem)] flex-col gap-2 text-[10px] sm:w-72 sm:text-xs z-50">
    <div
      role="alert"
      tabindex="0"
      class="alert alert-soft cursor-default flex min-h-12 sm:min-h-14 w-full items-center justify-between rounded-lg px-[10px] py-2 shadow-sm outline-none transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg focus:-translate-y-1 focus:shadow-lg focus-visible:ring-2 focus-visible:ring-current/25"
      :class="currentConfig.alertClass"
      @mouseenter="pauseAlertTimer('hover')"
      @mouseleave="resumeAlertTimer('hover')"
      @focusin="pauseAlertTimer('focus')"
      @focusout="resumeAlertTimer('focus')"
    >
      <div class="flex min-w-0 items-center gap-2">
        <div class="shrink-0 rounded-lg bg-base-100/40 p-1 backdrop-blur-xl" :class="currentConfig.iconClass">
          <svg
            v-if="type === 'error'"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-6"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="m15 9-6 6" />
            <path d="m9 9 6 6" />
          </svg>

          <svg
            v-else-if="type === 'warning'"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-6"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>

          <svg
            v-else-if="type === 'success'"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-6"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="m9 12 2 2 4-4" />
          </svg>

          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-6"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
        </div>

        <div class="min-w-0">
          <p class="truncate font-medium">{{ title }}</p>
          <p v-if="description" class="truncate opacity-65">{{ description }}</p>
        </div>
      </div>

      <button
        v-if="closable"
        type="button"
        class="btn btn-ghost btn-square btn-xs shrink-0 rounded-md hover:bg-base-content/10"
        aria-label="关闭提示"
        @click="handleClose"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="size-5"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>
