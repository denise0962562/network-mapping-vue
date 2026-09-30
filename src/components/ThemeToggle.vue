<script setup>
import { Moon, Sun, SunMoon } from '@lucide/vue'
import { ref, watchEffect } from 'vue'
import { useTheme } from '@/composables/useTheme'

const { themePreference, setThemePreference } = useTheme()
const modes = ['light', 'dark', 'system']
const labels = { light: '亮色', dark: '暗色', system: '跟随系统' }
const themeInput = ref(null)

// Native activation clears indeterminate and toggles checked. Restore both
// properties for every preference change, including system -> light.
watchEffect(() => {
  const preference = themePreference.value
  if (!themeInput.value) return
  themeInput.value.checked = preference === 'dark'
  themeInput.value.indeterminate = preference === 'system'
})

function cycleTheme() {
  setThemePreference(modes[(modes.indexOf(themePreference.value) + 1) % modes.length])
}
</script>

<template>
  <label
    class="swap swap-rotate btn btn-ghost btn-circle btn-sm shrink-0 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary"
    :title="`当前：${labels[themePreference]}；点击循环切换外观`"
  >
    <input
      ref="themeInput"
      type="checkbox"
      aria-label="外观主题"
      class="h-full w-full cursor-pointer"
      @change="cycleTheme"
    />
    <Sun class="swap-off pointer-events-none size-5 transition-[transform,rotate,opacity] duration-300 ease-in-out motion-reduce:transition-none" aria-hidden="true" />
    <Moon class="swap-on pointer-events-none size-5 transition-[transform,rotate,opacity] duration-300 ease-in-out motion-reduce:transition-none" aria-hidden="true" />
    <SunMoon
      class="swap-indeterminate pointer-events-none size-5 transition-[transform,rotate,opacity] duration-300 ease-in-out motion-reduce:transition-none"
      :class="themePreference === 'system' ? 'rotate-0' : 'rotate-45'"
      aria-hidden="true"
    />
    <span class="sr-only">{{ labels[themePreference] }}；按空格键循环切换亮色、暗色和跟随系统</span>
  </label>
</template>
