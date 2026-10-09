import { computed, reactive } from 'vue'
import { useRoute } from 'vue-router'
import http from '@/utils/http'

const createState = () => reactive({ report: null, loading: false, error: '', scenario: 'defaults', loaded: false })
const serverState = createState()
const serverPreviewState = createState()
const pendingLoads = new WeakMap()

export function useConfigCheck(endpoint = () => '') {
  const route = useRoute()
  const localState = createState()
  const localPreviewState = createState()
  const previewMode = computed(() => import.meta.env.DEV && route.query['config-check-preview'] === '1')
  const state = computed(() => endpoint() === '/api/config/check'
    ? previewMode.value ? serverPreviewState : serverState
    : previewMode.value ? localPreviewState : localState)

  async function loadPreview(scenario) {
    if (!import.meta.env.DEV) return
    const target = state.value
    target.scenario = scenario
    target.loading = true
    target.error = ''
    try {
      const { configCheckPreview } = await import('@/utils/configCheckPreview')
      target.report = scenario === 'error' ? null : configCheckPreview(scenario)
      if (scenario === 'error') target.error = '演示：配置检查结果加载失败，请重试。'
      target.loaded = true
    } finally {
      target.loading = false
    }
  }

  async function load(force = false) {
    const target = state.value
    if (pendingLoads.has(target)) return pendingLoads.get(target)
    if (!force && target.loaded) return
    if (previewMode.value) return loadPreview(target.scenario)
    if (!endpoint()) return
    target.loading = true
    target.error = ''
    const request = (async () => {
      try {
        const response = await http.get(endpoint())
        if (!response.data?.success || !Array.isArray(response.data.data?.items)) {
          throw new Error('服务器未返回有效配置检查结果')
        }
        target.report = response.data.data
        target.loaded = true
      } catch (failure) {
        target.report = null
        target.error = failure.response?.status === 404
          ? '当前服务端版本暂不支持配置检查。'
          : failure.response?.data?.message || '配置检查结果加载失败，请重试。'
      } finally {
        target.loading = false
        pendingLoads.delete(target)
      }
    })()
    pendingLoads.set(target, request)
    return request
  }

  return {
    snapshot: computed(() => state.value.report),
    loading: computed(() => state.value.loading),
    error: computed(() => state.value.error),
    previewScenario: computed(() => state.value.scenario),
    previewMode,
    load,
    loadPreview,
  }
}
