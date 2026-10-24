<script setup>
import { tr } from '../i18n/index.js'

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
  { get label() { return tr("前端") }, ...frontend },
  { get label() { return tr("后端") }, ...server },
].filter((update) => update.hasUpdate.value))
const updateTitle = computed(() => updates.value
  .map((update) => tr("{0}新版本 {1}", [update.label, update.latestVersion.value]))
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
      :aria-label="tr(&quot;查看{0}&quot;, [updateTitle])"
    >
      <span class="version-update-text">{{ expanded ? 'New!' : 'N!' }}</span>
    </a>
    <div v-else-if="expanded" class="badge badge-soft badge-primary w-full whitespace-nowrap" :title="updateTitle">
      <span class="version-update-text">New!</span>
      <span>
        <a :href="frontend.tagUrl.value" target="_blank" rel="noopener noreferrer" class="hover:underline" :aria-label="tr(&quot;查看前端新版本 {0}&quot;, [frontend.latestVersion.value])">{{ tr("前端") }}</a>/<a :href="server.tagUrl.value" target="_blank" rel="noopener noreferrer" class="hover:underline" :aria-label="tr(&quot;查看后端新版本 {0}&quot;, [server.latestVersion.value])">{{ tr("后端") }}</a>
      </span>
    </div>
    <button
      v-else
      type="button"
      class="badge badge-soft badge-primary w-full cursor-pointer whitespace-nowrap"
      :title="tr(&quot;{0}，展开导航栏选择版本&quot;, [updateTitle])"
      :aria-label="tr(&quot;展开导航栏查看前端和后端新版本&quot;)"
      @click="emit('expand')"
    >
      <span class="version-update-text">N!</span>
    </button>
  </div>
</template>
