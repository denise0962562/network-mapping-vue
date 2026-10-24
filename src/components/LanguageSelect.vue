<script setup>
import { ref } from 'vue'
import { locale, setLocale, tr } from '../i18n/index.js'

const persistenceFailed = ref(false)
function change(event) {
  persistenceFailed.value = !setLocale(event.target.value)
}
</script>

<template>
  <label class="flex min-w-0 items-center gap-2">
    <span class="sr-only">{{ tr('语言') }}</span>
    <select :value="locale" :aria-label="tr('语言')" class="select select-ghost select-sm w-auto max-w-36" @change="change">
      <option value="zh-CN" lang="zh-CN">简体中文</option>
      <option value="en" lang="en">English</option>
    </select>
    <span v-if="persistenceFailed" class="max-w-52 text-xs text-warning" role="status">{{ tr('浏览器未保存语言偏好；本页选择仍然有效。') }}</span>
  </label>
</template>
