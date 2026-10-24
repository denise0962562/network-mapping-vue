<script setup>
import { tr } from '../i18n/index.js'

import { ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'

const alerts = ref([])

const alertSamples = {
  info: {
    title: '12 unread messages',
    description: 'Tap to see the latest notifications.',
    timeout: 7000,
  },
  success: {
    title: 'Your purchase has been confirmed!',
    description: 'The operation completed successfully.',
    timeout: 5000,
  },
  warning: {
    title: 'Warning: Invalid email address!',
    description: 'Please check the address and try again.',
    timeout: 7000,
  },
  error: {
    title: 'Error! Task failed successfully.',
    description: 'Please try again after checking the task input.',
    timeout: 9000,
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
  <div class="page-shell">
    <div class="mb-5">
      <h1 class="page-title">{{ tr("Alert 测试") }}</h1>
      <p class="mt-1 text-sm opacity-60">{{ tr("点击按钮触发不同类型的通用提示组件。") }}</p>
    </div>
    <div class="big_card">

      <div class="flex flex-wrap gap-3">
        <button type="button" class="btn btn-info btn-soft" @click="triggerAlert('info')">{{ tr("信息") }}</button>
        <button type="button" class="btn btn-success btn-soft" @click="triggerAlert('success')">{{ tr("成功") }}</button>
        <button type="button" class="btn btn-warning btn-soft" @click="triggerAlert('warning')">{{ tr("警告") }}</button>
        <button type="button" class="btn btn-error btn-soft" @click="triggerAlert('error')">{{ tr("错误") }}</button>
      </div>
    </div>

    <div class="pointer-events-none fixed right-4 top-20 z-50 flex w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:w-auto">
      <AppAlert
        v-for="alert in alerts"
        :key="alert.id"
        class="pointer-events-auto"
        :type="alert.type"
        :title="alert.title"
        :description="alert.description"
        :timeout="alert.timeout"
        @close="closeAlert(alert.id)"
      />
    </div>
  </div>
</template>
