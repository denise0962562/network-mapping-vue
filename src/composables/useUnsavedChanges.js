import { onBeforeUnmount, onMounted, unref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

export function useUnsavedChanges(isDirty, saveChanges) {
  let allowNextNavigation = false

  function hasUnsavedChanges() {
    return Boolean(unref(isDirty))
  }

  function handleBeforeUnload(event) {
    if (!hasUnsavedChanges()) return
    event.preventDefault()
    event.returnValue = ''
  }

  onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))

  onBeforeRouteLeave(async () => {
    if (allowNextNavigation) {
      allowNextNavigation = false
      return true
    }
    if (!hasUnsavedChanges()) return true

    const shouldSave = window.confirm('当前页面有未保存的修改。是否保存后离开？')
    if (shouldSave) {
      try {
        const saved = await saveChanges()
        return saved !== false && !hasUnsavedChanges()
      } catch (error) {
        console.error('save before leaving failed', error)
        return false
      }
    }

    return window.confirm('修改尚未保存，确定放弃修改并离开吗？')
  })

  return {
    allowNextRouteLeave() {
      allowNextNavigation = true
    }
  }
}
