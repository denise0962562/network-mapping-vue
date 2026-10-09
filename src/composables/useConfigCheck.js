import { computed, reactive } from 'vue'
import http from '@/utils/http'

const createState = () => reactive({ report: null, loading: false, error: '', loaded: false })
const serverState = createState()
const pendingLoads = new WeakMap()

export function useConfigCheck(endpoint = () => '') {
  const localState = createState()
  const state = computed(() => endpoint() === '/api/config/check' ? serverState : localState)

  async function load(force = false) {
    const target = state.value
    if (pendingLoads.has(target)) return pendingLoads.get(target)
    if (!force && target.loaded) return
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
    load,
  }
}
