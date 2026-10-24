<script setup>
import { tr } from '../i18n/index.js'
import LanguageSelect from './LanguageSelect.vue'

defineProps({ retry: { type: Function, required: true } })
</script>

<template>
  <main class="flex min-h-screen flex-col items-center justify-center gap-4 bg-base-200 p-6">
    <LanguageSelect />
    <p role="alert">{{ tr('系统时间设置加载失败，请重试。') }}</p>
    <button type="button" class="btn btn-neutral btn-sm" @click="retry">{{ tr('重新加载') }}</button>
  </main>
</template>
