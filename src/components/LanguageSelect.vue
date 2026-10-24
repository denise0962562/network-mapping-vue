<script setup>
import { ref, useId } from 'vue'
import { Check, ChevronDown, Globe } from '@lucide/vue'
import { locale, setLocale, tr } from '../i18n/index.js'

const persistenceFailed = ref(false)
const menuId = useId()
const anchorName = `--language-${menuId}`
const menu = ref(null)
const expanded = ref(false)
const languages = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
]

function change(value) {
  persistenceFailed.value = !setLocale(value)
  menu.value?.hidePopover()
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-2">
    <button
      type="button"
      class="btn btn-ghost btn-sm gap-2"
      :popovertarget="menuId"
      :style="{ anchorName }"
      :aria-label="tr('语言')"
      :aria-expanded="expanded"
      :aria-controls="menuId"
    >
      <Globe class="size-4 shrink-0" aria-hidden="true" />
      <span>{{ languages.find(language => language.value === locale)?.label }}</span>
      <ChevronDown class="size-3.5 transition-transform motion-reduce:transition-none" :class="{ 'rotate-180': expanded }" aria-hidden="true" />
    </button>
    <ul
      :id="menuId"
      ref="menu"
      popover="auto"
      class="language-menu dropdown dropdown-end menu rounded-box w-40 border border-base-300 bg-base-100 p-1.5 text-base-content shadow-lg"
      :style="{ positionAnchor: anchorName }"
      :aria-label="tr('语言')"
      @toggle="expanded = $event.newState === 'open'"
    >
      <li v-for="language in languages" :key="language.value">
        <button
          type="button"
          :lang="language.value"
          :aria-current="locale === language.value ? 'true' : undefined"
          :class="{ 'menu-active': locale === language.value }"
          @click="change(language.value)"
        >
          <span class="flex-1">{{ language.label }}</span>
          <Check v-if="locale === language.value" class="size-4" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <span v-if="persistenceFailed" class="max-w-52 text-xs text-warning" role="status">{{ tr('浏览器未保存语言偏好；本页选择仍然有效。') }}</span>
  </div>
</template>

<style scoped>
.language-menu {
  margin: 0.5rem 0;
  position-try-fallbacks: flip-block, flip-inline;
}
</style>
