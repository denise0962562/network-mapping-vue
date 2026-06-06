<script setup>
import { ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'

const alerts = ref([])

const alertSamples = {
  info: {
    title: '12 unread messages',
    description: 'Tap to see the latest notifications.',
  },
  success: {
    title: 'Your purchase has been confirmed!',
    description: 'The operation completed successfully.',
  },
  warning: {
    title: 'Warning: Invalid email address!',
    description: 'Please check the address and try again.',
  },
  error: {
    title: 'Error! Task failed successfully.',
    description: 'Please try again after checking the task input.',
  },
}

function triggerAlert(type) {
  alerts.value.unshift({
    id: crypto.randomUUID(),
    type,
    ...alertSamples[type],
  })
}

function closeAlert(id) {
  alerts.value = alerts.value.filter((alert) => alert.id !== id)
}
</script>

<template>
  <div class="p-5">
    <div class="big_card max-w-4xl">
      <div class="mb-5">
        <h2 class="text-lg font-semibold">Alert 测试</h2>
        <p class="mt-1 text-sm opacity-60">点击按钮触发不同类型的通用提示组件。</p>
      </div>

      <div class="flex flex-wrap gap-3">
        <button type="button" class="btn btn-info btn-soft" @click="triggerAlert('info')">信息</button>
        <button type="button" class="btn btn-success btn-soft" @click="triggerAlert('success')">成功</button>
        <button type="button" class="btn btn-warning btn-soft" @click="triggerAlert('warning')">警告</button>
        <button type="button" class="btn btn-error btn-soft" @click="triggerAlert('error')">错误</button>
      </div>
    </div>

    <div class="pointer-events-none fixed top-20 left-1/2 flex w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2 sm:left-auto sm:right-5 sm:w-auto sm:translate-x-0 sm:items-end">
      <AppAlert
        v-for="alert in alerts"
        :key="alert.id"
        class="pointer-events-auto"
        :type="alert.type"
        :title="alert.title"
        :description="alert.description"
        @close="closeAlert(alert.id)"
      />
    </div>
  </div>
</template>
