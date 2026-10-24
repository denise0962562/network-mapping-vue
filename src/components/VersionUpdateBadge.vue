<script setup>
import { tr } from '../i18n/index.js'

import { useVersionUpdate } from '@/composables/useVersionUpdate'

const props = defineProps({
  component: { type: String, required: true },
  currentVersion: { type: String, default: '' },
  label: { type: String, default: 'New!' },
})
const { hasUpdate, latestVersion, tagUrl } = useVersionUpdate(props.component, () => props.currentVersion)
</script>

<template>
  <a
    v-if="hasUpdate"
    :href="tagUrl"
    target="_blank"
    rel="noopener noreferrer"
    class="badge badge-soft badge-primary whitespace-nowrap"
    :title="tr(&quot;当前 {0}，最新 {1}，点击查看新版&quot;, [currentVersion, latestVersion])"
  >
    <span class="version-update-text">{{ label }}</span>
  </a>
</template>
