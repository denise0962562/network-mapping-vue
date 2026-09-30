import { computed, readonly, ref } from 'vue'

const controller = window.networkMappingTheme
const preference = ref(controller.getPreference())
const theme = ref(controller.getTheme())

controller.subscribe((state) => {
  preference.value = state.preference
  theme.value = state.theme
})

const isDark = computed(() => theme.value === 'dark')

export function useTheme() {
  return {
    themePreference: readonly(preference),
    resolvedTheme: readonly(theme),
    isDark,
    setThemePreference: (value) => controller.setPreference(value)
  }
}
