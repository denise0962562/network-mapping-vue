import { computed, onMounted, ref, toValue } from 'vue'
import { checkLatestVersion, isNewerVersion, versionRepositories } from '@/utils/versionUpdates'

const latestVersions = new Map()

export function useVersionUpdate(component, currentVersion) {
  if (!latestVersions.has(component)) latestVersions.set(component, ref(''))
  const latestVersion = latestVersions.get(component)
  onMounted(async () => {
    latestVersion.value = await checkLatestVersion(component)
  })
  return {
    latestVersion,
    hasUpdate: computed(() => isNewerVersion(latestVersion.value, toValue(currentVersion))),
    tagUrl: computed(() => `https://github.com/${versionRepositories[component]}/tree/${encodeURIComponent(latestVersion.value)}`),
  }
}
