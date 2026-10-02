<script setup>
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
    :title="`当前 ${currentVersion}，最新 ${latestVersion}，点击查看新版`"
  >
    <span class="version-update-text">{{ label }}</span>
  </a>
</template>
