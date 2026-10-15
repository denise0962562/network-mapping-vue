<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { formatDateTime } from '@/utils/systemTime'
import { alertHighlights, alertService, alertSubject, alertTypeLabel, healthAlertTypes, severityClass, severityLabel } from '@/utils/healthAlerts'
import AppAlert from '@/components/AppAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import HealthAlertDetail from '@/components/HealthAlertDetail.vue'
import http from '@/utils/http'

const alerts = ref([])
const items = ref([])
const loading = ref(false)
const loadFailed = ref(false)
const failedQuery = ref(null)
const forbidden = ref(false)
const hasLoaded = ref(false)
const lastLoadedAt = ref(null)
const expandedId = ref(null)
const page = ref(1)
const pageSize = 25
const total = ref(0)
let controller
let requestSequence = 0

const windowOptions = [
  { value: '', label: '全部时间' },
  { value: '1h', label: '最近 1 小时' },
  { value: '24h', label: '最近 24 小时' },
  { value: '7d', label: '最近 7 天' },
]
const defaultFilters = () => ({ window: '24h', alert_type: '', severity: '' })
const filters = ref(defaultFilters())
const appliedFilters = ref(defaultFilters())
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const pageStats = computed(() => ({
  critical: items.value.filter((item) => item.severity === 'critical').length,
  warning: items.value.filter((item) => item.severity === 'warning').length,
  services: new Set(items.value.map((item) => alertService(item.alert_type))).size,
}))
const appliedLabel = computed(() => [
  windowOptions.find((option) => option.value === appliedFilters.value.window)?.label,
  appliedFilters.value.alert_type ? alertTypeLabel(appliedFilters.value.alert_type) : '全部类型',
  appliedFilters.value.severity ? severityLabel(appliedFilters.value.severity) : '全部级别',
].join(' · '))
const errorMessage = computed(() => forbidden.value ? '只有管理员可以查看健康告警。' : '请检查网络连接或服务器运行状态，然后重试。')

function pushAlert(type, title, description = '') {
  alerts.value.unshift({ id: crypto.randomUUID(), type, title, description, timeout: 7000 })
}

function closeAlert(id) {
  alerts.value = alerts.value.filter((alert) => alert.id !== id)
}

function formatTime(value) {
  return value ? formatDateTime(value) : '--'
}

function buildParams(nextFilters, nextPage) {
  const params = { page: nextPage, page_size: pageSize }
  if (nextFilters.alert_type) params.alert_type = nextFilters.alert_type
  if (nextFilters.severity) params.severity = nextFilters.severity
  const windowMs = { '1h': 3600_000, '24h': 86400_000, '7d': 7 * 86400_000 }[nextFilters.window]
  if (windowMs) {
    const now = Date.now()
    params.start = new Date(now - windowMs).toISOString()
    params.end = new Date(now).toISOString()
  }
  return params
}

async function loadItems(nextPage = page.value, nextFilters = appliedFilters.value) {
  controller?.abort()
  controller = new AbortController()
  const sequence = ++requestSequence
  const snapshot = { ...nextFilters }
  loading.value = true
  try {
    const response = await http.get('/api/health/alerts', { params: buildParams(snapshot, nextPage), signal: controller.signal })
    if (sequence !== requestSequence) return
    const data = response.data
    if (data?.success !== true || !Array.isArray(data.items) || !Number.isFinite(data.pagination?.total) || data.pagination.total < 0) {
      throw new Error('健康告警响应格式无效')
    }
    items.value = data.items
    total.value = data.pagination.total
    page.value = nextPage
    appliedFilters.value = snapshot
    if (!data.items.some((item) => item.id === expandedId.value)) expandedId.value = null
    loadFailed.value = false
    failedQuery.value = null
    forbidden.value = false
    hasLoaded.value = true
    lastLoadedAt.value = new Date()
  } catch (error) {
    if (sequence !== requestSequence || error.code === 'ERR_CANCELED') return
    failedQuery.value = { page: nextPage, filters: snapshot }
    forbidden.value = error.response?.status === 403
    loadFailed.value = true
    if (forbidden.value) {
      items.value = []
      total.value = 0
      hasLoaded.value = false
      expandedId.value = null
      lastLoadedAt.value = null
    }
    pushAlert('error', hasLoaded.value ? '健康告警刷新失败' : '健康告警加载失败', errorMessage.value)
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function retryLoad() {
  if (loading.value) return
  const query = failedQuery.value
  return query ? loadItems(query.page, query.filters) : loadItems()
}

function applyFilters() {
  loadItems(1, filters.value)
}

function resetFilters() {
  filters.value = defaultFilters()
  applyFilters()
}

function changePage(nextPage) {
  if (loading.value || nextPage < 1 || nextPage > totalPages.value || nextPage === page.value) return
  loadItems(nextPage)
}

async function copyRecord(item) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(item, null, 2))
    pushAlert('success', '完整告警记录已复制')
  } catch {
    pushAlert('warning', '无法访问剪贴板', '请展开“原始告警记录（JSON）”，选择并复制内容。')
  }
}

onMounted(() => loadItems())
onBeforeUnmount(() => { requestSequence += 1; controller?.abort() })
</script>

<template>
  <div class="pointer-events-none fixed right-4 top-20 z-50 flex w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:w-auto">
    <AppAlert v-for="alert in alerts" :key="alert.id" class="pointer-events-auto" v-bind="alert" @close="closeAlert(alert.id)" />
  </div>

  <main class="space-y-4 p-4 md:p-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">健康告警</h1>
        <p class="mt-1 text-sm text-base-content/60">查看 Web 请求、PostgreSQL 与 Elasticsearch 的异常记录、诊断数据和触发规则。</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <RouterLink to="/setting/runtime" class="btn btn-ghost btn-sm">监控配置</RouterLink>
        <button class="btn btn-outline btn-sm" :disabled="loading" @click="loadItems()">
          <span v-if="loading" class="loading loading-spinner loading-xs" aria-hidden="true"></span>
          {{ loading ? '加载中' : '刷新告警' }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="告警概览">
      <div class="rounded-box border border-base-300 bg-base-100 p-4">
        <p class="text-xs text-base-content/60">筛选结果总数</p>
        <p class="mt-2 text-2xl font-semibold tabular-nums">{{ hasLoaded ? total.toLocaleString() : '--' }}</p>
        <p class="mt-1 text-xs text-base-content/50">当前已应用条件 · 全部分页</p>
      </div>
      <div class="rounded-box border border-base-300 bg-base-100 p-4">
        <p class="text-xs text-base-content/60">当前页 · 严重</p>
        <p class="mt-2 text-2xl font-semibold text-error tabular-nums">{{ hasLoaded ? pageStats.critical : '--' }}</p>
        <p class="mt-1 text-xs text-base-content/50">优先检查错误及高耗时操作</p>
      </div>
      <div class="rounded-box border border-base-300 bg-base-100 p-4">
        <p class="text-xs text-base-content/60">当前页 · 警告</p>
        <p class="mt-2 text-2xl font-semibold text-warning tabular-nums">{{ hasLoaded ? pageStats.warning : '--' }}</p>
        <p class="mt-1 text-xs text-base-content/50">关注性能与依赖响应变化</p>
      </div>
      <div class="rounded-box border border-base-300 bg-base-100 p-4">
        <p class="text-xs text-base-content/60">当前页 · 涉及服务</p>
        <p class="mt-2 text-2xl font-semibold tabular-nums">{{ hasLoaded ? pageStats.services : '--' }}</p>
        <p class="mt-1 text-xs text-base-content/50">按 Web API、数据库及 ES 分类</p>
      </div>
    </div>

    <form class="card border border-base-300 bg-base-100 shadow-sm" @submit.prevent="applyFilters">
      <div class="card-body gap-4 p-4">
        <div class="grid gap-3 md:grid-cols-3">
          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">时间范围</span>
            <select v-model="filters.window" class="select select-bordered w-full" :disabled="loading">
              <option v-for="option in windowOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">告警类型</span>
            <select v-model="filters.alert_type" class="select select-bordered w-full" :disabled="loading">
              <option value="">全部类型</option>
              <option v-for="option in healthAlertTypes" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label class="form-control w-full">
            <span class="label-text mb-1 text-xs">级别</span>
            <select v-model="filters.severity" class="select select-bordered w-full" :disabled="loading">
              <option value="">全部级别</option>
              <option value="warning">警告</option>
              <option value="critical">严重</option>
            </select>
          </label>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs text-base-content/50">相同告警会按冷却规则去重，记录数不等同于实际异常次数。</p>
          <div class="flex gap-2">
            <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" @click="resetFilters">重置</button>
            <button type="submit" class="btn btn-neutral btn-sm" :disabled="loading">查询</button>
          </div>
        </div>
      </div>
    </form>

    <section class="overflow-hidden rounded-box border border-base-300 bg-base-100" :aria-busy="loading" aria-labelledby="health-records-title">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 p-4">
        <div>
          <h2 id="health-records-title" class="font-semibold">告警记录</h2>
          <p class="mt-1 text-xs text-base-content/60">{{ appliedLabel }}</p>
        </div>
        <p class="text-xs text-base-content/50" role="status">{{ loading ? '正在获取最新记录…' : lastLoadedAt ? `最近更新：${formatTime(lastLoadedAt)}` : '尚未加载' }}</p>
      </div>
      <div v-if="loadFailed && hasLoaded" role="alert" class="flex flex-wrap items-center justify-between gap-2 border-b border-warning/30 bg-warning/10 px-4 py-3 text-sm">
        <span>刷新失败，以下仍为上次成功加载的数据。{{ errorMessage }}</span>
        <button class="btn btn-sm btn-ghost" :disabled="loading" @click="retryLoad()">重试</button>
      </div>
      <div v-if="loading && !hasLoaded" class="space-y-3 p-5" aria-label="正在加载告警">
        <div class="skeleton h-64 w-full rounded-box"></div>
      </div>
      <div v-else-if="loadFailed && !hasLoaded" class="pb-5 text-center">
        <EmptyState type="error" :title="forbidden ? '无权查看健康告警' : '加载数据失败'" :message="errorMessage" />
        <button class="btn btn-outline btn-sm" :disabled="loading" @click="retryLoad()">重新加载</button>
      </div>
      <EmptyState v-else-if="items.length === 0" title="暂无健康告警" message="当前筛选条件下没有告警记录，可调整时间范围或告警类型后重新查询。历史记录不代表服务的实时健康状态。" />
      <div v-else>
        <div class="divide-y divide-base-300 md:hidden">
          <article v-for="item in items" :key="item.id">
            <div class="space-y-3 p-4">
              <div class="flex flex-wrap items-center gap-2">
                <span class="badge badge-sm" :class="severityClass(item.severity)">{{ severityLabel(item.severity) }}</span>
                <span class="text-sm font-medium">{{ alertTypeLabel(item.alert_type) }}</span>
                <span class="text-xs text-base-content/50">{{ alertService(item.alert_type) }}</span>
              </div>
              <p class="break-words text-sm">{{ item.summary || '未记录摘要' }}</p>
              <p class="break-all font-mono text-xs text-base-content/60">{{ alertSubject(item) }}</p>
              <dl class="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                <div v-for="metric in alertHighlights(item)" :key="metric.label"><dt class="text-base-content/50">{{ metric.label }}</dt><dd class="mt-1 break-all font-mono">{{ metric.value }}</dd></div>
              </dl>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <time class="text-xs text-base-content/50" :datetime="item.occurred_at">{{ formatTime(item.occurred_at) }} · #{{ item.id }}</time>
                <button class="btn btn-ghost btn-sm" :aria-label="`${expandedId === item.id ? '收起' : '查看'}告警 #${item.id} 详情`" :aria-expanded="expandedId === item.id" :aria-controls="`health-mobile-detail-${item.id}`" @click="expandedId = expandedId === item.id ? null : item.id">{{ expandedId === item.id ? '收起详情' : '查看详情' }}</button>
              </div>
            </div>
            <HealthAlertDetail v-if="expandedId === item.id" :id="`health-mobile-detail-${item.id}`" class="border-t border-base-300 bg-base-200/40" :item="item" @copy="copyRecord" />
          </article>
        </div>
        <div class="hidden overflow-x-auto md:block">
          <table class="table w-full min-w-[880px] table-fixed">
          <caption class="sr-only">健康告警历史，展开详情可查看完整诊断字段与触发规则。</caption>
          <thead>
            <tr>
              <th scope="col" class="w-40">发生时间</th>
              <th scope="col" class="w-36">服务 / 类型</th>
              <th scope="col" class="w-20">级别</th>
              <th scope="col">摘要 / 告警对象</th>
              <th scope="col" class="w-52">关键指标</th>
              <th scope="col" class="w-28">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="item in items" :key="item.id">
              <tr class="align-top" :class="expandedId === item.id ? 'bg-base-200/60' : 'hover:bg-base-200/40'">
                <td class="text-xs"><time :datetime="item.occurred_at">{{ formatTime(item.occurred_at) }}</time><p class="mt-2 text-base-content/40">#{{ item.id }}</p></td>
                <td><p class="mb-2 text-xs text-base-content/60">{{ alertService(item.alert_type) }}</p><span class="badge badge-outline badge-sm h-auto py-1">{{ alertTypeLabel(item.alert_type) }}</span></td>
                <td><span class="badge badge-sm" :class="severityClass(item.severity)">{{ severityLabel(item.severity) }}</span></td>
                <td class="break-words text-sm"><p>{{ item.summary || '未记录摘要' }}</p><p class="mt-2 break-all font-mono text-xs text-base-content/50">{{ alertSubject(item) }}</p></td>
                <td><dl v-if="alertHighlights(item).length" class="space-y-1 text-xs"><div v-for="metric in alertHighlights(item)" :key="metric.label" class="flex flex-wrap gap-x-2"><dt class="text-base-content/50">{{ metric.label }}</dt><dd class="break-all font-mono">{{ metric.value }}</dd></div></dl><span v-else class="text-xs text-base-content/40">未记录指标</span></td>
                <td><button class="btn btn-ghost btn-sm" :aria-label="`${expandedId === item.id ? '收起' : '查看'}告警 #${item.id} 详情`" :aria-expanded="expandedId === item.id" :aria-controls="`health-detail-${item.id}`" @click="expandedId = expandedId === item.id ? null : item.id">{{ expandedId === item.id ? '收起详情' : '查看详情' }}</button></td>
              </tr>
              <tr v-if="expandedId === item.id">
                <td colspan="6" class="bg-base-200/40 p-0"><HealthAlertDetail :id="`health-detail-${item.id}`" :item="item" @copy="copyRecord" /></td>
              </tr>
            </template>
          </tbody>
          </table>
        </div>
      </div>
    </section>

    <div v-if="hasLoaded && total > 0" class="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span class="text-base-content/60">共 {{ total }} 条 · 当前页 {{ items.length }} 条 · 第 {{ page }} / {{ totalPages }} 页</span>
      <nav class="join" aria-label="告警分页">
        <button class="btn btn-sm join-item" :disabled="page <= 1 || loading" @click="changePage(page - 1)">上一页</button>
        <button class="btn btn-sm join-item" :disabled="page >= totalPages || loading" @click="changePage(page + 1)">下一页</button>
      </nav>
    </div>
    <p class="text-xs text-base-content/50">此页展示历史告警，不表示异常已恢复或仍在持续。展开记录可查看完整字段与建议排查步骤。</p>
  </main>
</template>
