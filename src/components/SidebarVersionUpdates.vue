<script setup>
import { computed } from 'vue'
import { useVersionUpdate } from '@/composables/useVersionUpdate'

const props = defineProps({
  expanded: { type: Boolean, default: true },
  frontendVersion: { type: String, default: '' },
  serverVersion: { type: String, default: '' },
})
const emit = defineEmits(['expand'])
const frontend = useVersionUpdate('frontend', () => props.frontendVersion)
const server = useVersionUpdate('server', () => props.serverVersion)
const updates = computed(() => [
  { label: '前端', ...frontend },
  { label: '后端', ...server },
].filter((update) => update.hasUpdate.value))
const updateTitle = computed(() => updates.value
  .map((update) => `${update.label}新版本 ${update.latestVersion.value}`)
  .join(' / '))
</script>

<template>
  <div v-if="updates.length">
    <a
      v-if="updates.length === 1"
      :href="updates[0].tagUrl.value"
      target="_blank"
      rel="noopener noreferrer"
      class="badge badge-soft badge-primary w-full whitespace-nowrap"
      :title="updateTitle"
      :aria-label="`查看${updateTitle}`"
    >
      <span class="version-update-text">{{ expanded ? 'New!' : 'N!' }}</span>
    </a>
    <div v-else-if="expanded" class="badge badge-soft badge-primary w-full whitespace-nowrap" :title="updateTitle">
      <span class="version-update-text">New!</span>
      <span>
        <a :href="frontend.tagUrl.value" target="_blank" rel="noopener noreferrer" class="hover:underline" :aria-label="`查看前端新版本 ${frontend.latestVersion.value}`">前端</a>/<a :href="server.tagUrl.value" target="_blank" rel="noopener noreferrer" class="hover:underline" :aria-label="`查看后端新版本 ${server.latestVersion.value}`">后端</a>
      </span>
    </div>
    <button
      v-else
      type="button"
      class="badge badge-soft badge-primary w-full cursor-pointer whitespace-nowrap"
      :title="`${updateTitle}，展开导航栏选择版本`"
      aria-label="展开导航栏查看前端和后端新版本"
      @click="emit('expand')"
    >
      <span class="version-update-text">N!</span>
    </button>
  </div>
</template>
