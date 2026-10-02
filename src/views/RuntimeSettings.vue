<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import MonitorRulesEditor from '@/components/MonitorRulesEditor.vue'
import { normalizeMonitor, policyDiff, scannerHealthDefaults, scannerHealthFields, validateMonitor, validateScannerHealth } from '@/utils/monitorRules'
import { formatDateTime as formatSystemDateTime } from '@/utils/systemTime'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import http from '@/utils/http'

const namespaces = [
  { key: 'requests', title: '请求日志', description: '控制访问日志采集和在线保留期。' },
  { key: 'monitor', title: '健康监控', description: '按服务和具体操作管理慢检测阈值、告警级别及冷却时间。' },
  { key: 'scanner_health', title: '扫描器在线与告警', description: '管理在线判定、掉线告警时间、维护宽限期和通信延迟标识。' },
  { key: 'automatic_target', title: '自动目标', description: '控制系统自动生成的 IPv4/IPv6 扫描任务。' },
  { key: 'dns_follow_up', title: 'DNS 后续任务', description: '控制 DNS 解析结果自动创建端口扫描任务的范围。' },
  { key: 'dns_resolvers', title: 'DNS 服务器', description: '维护创建域名扫描任务时可选择的常用 DNS 服务器。' },
  { key: 'analytics_snapshot', title: '分析快照', description: '控制离线分析快照的模式与处理频率。' },
]

const defaults = {
  requests: { enabled: true, retention_days: 30 },
  monitor: {
    enabled: true,
    slow_request_threshold_ms: 3000,
    server_error_enabled: true,
    slow_sql_threshold_ms: 3000,
    slow_sql_check_interval_seconds: 60,
    elasticsearch_query_warning_threshold_ms: 1000,
    elasticsearch_query_critical_threshold_ms: 3000,
    elasticsearch_write_warning_threshold_ms: 5000,
    elasticsearch_write_critical_threshold_ms: 15000,
    alert_cooldown_seconds: 300,
  },
  scanner_health: scannerHealthDefaults,
  automatic_target: {
    search_generation: {
      enabled: false, stale_after_days: 7, cooldown_minutes: 1440,
      max_pending_tasks: 100, per_user_hourly_limit: 20,
      domain_enabled: false, authorized_domains: [],
    },
    enabled: false,
    strategy: 'sequential_subnet',
    interval_seconds: 30,
    pending_low_watermark: 2,
    pending_high_watermark: 5,
    priority: 0,
    authorized_cidrs: [],
    excluded_cidrs: [],
    ipv4_task_prefix: 24,
    ipv6_enabled: false,
    ipv6_authorized_cidrs: [],
    ipv6_excluded_cidrs: [],
    ipv6_task_prefix: 120,
    ipv6_pending_low_watermark: 1,
    ipv6_pending_high_watermark: 2,
    common_ports: '',
    repeat_after_seconds: 604800,
  },
  dns_follow_up: { enabled: false, authorized_cidrs: [], excluded_cidrs: [], max_targets_per_task: 100 },
  dns_resolvers: { resolvers: [] },
  analytics_snapshot: { mode: 'realtime', interval_minutes: 30 },
}

defaults.monitor = normalizeMonitor(defaults.monitor)

const alerts = ref([])
const activeTab = ref('requests')
const loading = reactive(Object.fromEntries(namespaces.map(({ key }) => [key, false])))
const saving = reactive(Object.fromEntries(namespaces.map(({ key }) => [key, false])))
const revisions = reactive(Object.fromEntries(namespaces.map(({ key }) => [key, 0])))
const settings = reactive(structuredClone(defaults))
const savedDocuments = reactive({})
const catalogue = ref([])
const catalogueLoading = ref(false)
const catalogueError = ref('')
const sqlMessage = ref('')
const previewNamespace = ref(null)
const history = ref([])
const historyLoading = ref(false)
const conflicts = reactive({})
const historyError = ref('')
const previewRows = computed(() => previewNamespace.value ? policyDiff(previewNamespace.value, savedDocuments[previewNamespace.value], documentFor(previewNamespace.value), catalogue.value) : [])
const policyNamespace = computed(() => ['monitor', 'scanner_health'].includes(activeTab.value))
const changeReasons = reactive(Object.fromEntries(namespaces.map(({ key }) => [key, ''])))
const cidrText = reactive({
  searchDomains: '',
  automaticAuthorized: '',
  automaticExcluded: '',
  automaticIpv6Authorized: '',
  automaticIpv6Excluded: '',
  dnsAuthorized: '',
  dnsExcluded: '',
})

function pushAlert(type, title, description = '', timeout = 7000) {
  alerts.value.unshift({ id: crypto.randomUUID(), type, title, description, timeout })
}

function closeAlert(id) {
  alerts.value = alerts.value.filter((alert) => alert.id !== id)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function linesToList(value) {
  return [...new Set(value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean))]
}

function listToLines(value) {
  return Array.isArray(value) ? value.join('\n') : ''
}

function addDnsResolverPreset() {
  if (settings.dns_resolvers.resolvers.length >= 32) return
  const index = settings.dns_resolvers.resolvers.length + 1
  settings.dns_resolvers.resolvers.push({ id: `dns-${index}`, label: `DNS 服务器 ${index}`, ip: '', port: 53, transport: 'udp', enabled: true })
}

function removeDnsResolverPreset(index) {
  settings.dns_resolvers.resolvers.splice(index, 1)
}

function documentFor(namespace) {
  if (namespace === 'monitor') return normalizeMonitor(settings.monitor)
  if (namespace === 'automatic_target') {
    return {
      ...settings.automatic_target,
      search_generation: { ...settings.automatic_target.search_generation, authorized_domains: linesToList(cidrText.searchDomains) },
      authorized_cidrs: linesToList(cidrText.automaticAuthorized),
      excluded_cidrs: linesToList(cidrText.automaticExcluded),
      ipv6_authorized_cidrs: linesToList(cidrText.automaticIpv6Authorized),
      ipv6_excluded_cidrs: linesToList(cidrText.automaticIpv6Excluded),
    }
  }
  if (namespace === 'dns_follow_up') {
    return {
      ...settings.dns_follow_up,
      authorized_cidrs: linesToList(cidrText.dnsAuthorized),
      excluded_cidrs: linesToList(cidrText.dnsExcluded),
    }
  }
  return clone(settings[namespace])
}

function applyDocument(namespace, document, revision) {
  settings[namespace] = namespace === 'monitor' ? normalizeMonitor({ ...clone(defaults.monitor), ...clone(document) }) : { ...clone(defaults[namespace]), ...clone(document) }
  revisions[namespace] = revision
  if (namespace === 'automatic_target') {
    settings.automatic_target.search_generation = { ...clone(defaults.automatic_target.search_generation), ...clone(document.search_generation || {}) }
    cidrText.searchDomains = listToLines(settings.automatic_target.search_generation.authorized_domains)
    cidrText.automaticAuthorized = listToLines(document.authorized_cidrs)
    cidrText.automaticExcluded = listToLines(document.excluded_cidrs)
    cidrText.automaticIpv6Authorized = listToLines(document.ipv6_authorized_cidrs)
    cidrText.automaticIpv6Excluded = listToLines(document.ipv6_excluded_cidrs)
  }
  if (namespace === 'dns_follow_up') {
    cidrText.dnsAuthorized = listToLines(document.authorized_cidrs)
    cidrText.dnsExcluded = listToLines(document.excluded_cidrs)
  }
  savedDocuments[namespace] = documentFor(namespace)
  changeReasons[namespace] = ''
  delete conflicts[namespace]
}

function isDirty(namespace) {
  return Boolean(savedDocuments[namespace]) && JSON.stringify(documentFor(namespace)) !== JSON.stringify(savedDocuments[namespace])
}

const hasUnsavedChanges = computed(() => namespaces.some(({ key }) => isDirty(key)))
const activeItem = computed(() => namespaces.find(({ key }) => key === activeTab.value) || namespaces[0])

function selectTab(namespace) {
  activeTab.value = namespace
  history.value = []
  historyError.value = ''
}

async function loadNamespace(namespace, silent = false) {
  loading[namespace] = true
  try {
    const response = await http.get(`/api/config/runtime/${namespace}`)
    const data = response.data?.data
    if (!data?.document || !Number.isInteger(data.revision)) throw new Error('invalid runtime config response')
    applyDocument(namespace, data.document, data.revision)
  } catch (error) {
    console.error(`load runtime config ${namespace} failed`, error)
    if (!silent) pushAlert('error', '运行时配置加载失败', `${namespace}：${error.response?.data?.message || '请检查服务端连接。'}`)
  } finally {
    loading[namespace] = false
  }
}

async function loadAll() {
  await Promise.all([...namespaces.map(({ key }) => loadNamespace(key)), loadCatalogue()])
}

async function loadCatalogue() {
  catalogueLoading.value = true
  catalogueError.value = ''
  try {
    const response = await http.get('/api/config/monitor/operations')
    const data = response.data?.data
    if (!Array.isArray(data?.operations)) throw new Error('invalid operation catalogue')
    catalogue.value = data.operations
    sqlMessage.value = data.postgresql_message || ''
  } catch {
    catalogueError.value = '操作目录加载失败，请重试后保存健康监控规则。'
  } finally {
    catalogueLoading.value = false
  }
}

function validationError(namespace) {
  if (namespace === 'monitor') {
    if (catalogueLoading.value || catalogueError.value || !catalogue.value.length) return '请先成功加载操作目录'
    return validateMonitor(settings.monitor, catalogue.value)
  }
  if (namespace === 'scanner_health') return validateScannerHealth(settings.scanner_health)
  return ''
}

function requestSave(namespace) {
  if (!isDirty(namespace)) return
  const error = validationError(namespace)
  if (error) { pushAlert('error', '配置需要修正', error); return }
  if (['monitor', 'scanner_health'].includes(namespace)) previewNamespace.value = namespace
  else saveNamespace(namespace)
}

async function confirmSave() {
  const namespace = previewNamespace.value
  if (namespace && await saveNamespace(namespace)) {
    previewNamespace.value = null
    history.value = []
  }
}

async function loadHistory() {
  const namespace = activeTab.value
  historyLoading.value = true
  historyError.value = ''
  try {
    const response = await http.get(`/api/config/runtime/${namespace}/history`)
    if (!Array.isArray(response.data?.data)) throw new Error('invalid history response')
    if (activeTab.value === namespace) history.value = response.data.data
  } catch {
    if (activeTab.value === namespace) historyError.value = '配置历史加载失败，请重试。'
  } finally {
    historyLoading.value = false
  }
}

function restoreVersion(item) {
  const namespace = activeTab.value
  settings[namespace] = namespace === 'monitor' ? normalizeMonitor({ ...clone(defaults.monitor), ...clone(item.document) }) : { ...clone(defaults[namespace]), ...clone(item.document) }
  changeReasons[namespace] = `恢复历史版本 #${item.revision}`
  pushAlert('info', '历史配置已载入草稿', '请检查差异后保存，保存将生成新版本。')
}

function reviewConflict(namespace) {
  const latest = conflicts[namespace]
  if (!latest) return
  savedDocuments[namespace] = namespace === 'monitor' ? normalizeMonitor({ ...clone(defaults.monitor), ...clone(latest.document) }) : { ...clone(defaults[namespace]), ...clone(latest.document) }
  revisions[namespace] = latest.revision
  delete conflicts[namespace]
  requestSave(namespace)
}

async function saveNamespace(namespace) {
  if (saving[namespace] || !isDirty(namespace)) return true
  const errorMessage = validationError(namespace)
  if (errorMessage) { pushAlert('error', '配置需要修正', errorMessage); return false }
  saving[namespace] = true
  try {
    const response = await http.post(`/api/config/runtime/${namespace}`, {
      expectedRevision: revisions[namespace],
      document: documentFor(namespace),
      changeReason: changeReasons[namespace].trim(),
    })
    const data = response.data?.data
    if (!data?.document || !Number.isInteger(data.revision)) throw new Error('invalid runtime config response')
    applyDocument(namespace, data.document, data.revision)
    pushAlert('success', '运行时配置已发布', `${namespace} 已应用，当前版本为 #${data.revision}。`)
    return true
  } catch (error) {
    console.error(`save runtime config ${namespace} failed`, error)
    if (error.response?.status === 409) {
      pushAlert('warning', '配置已被更新', '本地草稿已保留。请对照最新配置重新检查差异。')
      previewNamespace.value = null
      try {
        const latest = await http.get(`/api/config/runtime/${namespace}`)
        if (latest.data?.data?.document) conflicts[namespace] = latest.data.data
      } catch { pushAlert('error', '最新配置读取失败', '本地草稿仍保留，请稍后重试。') }
    } else {
      pushAlert('error', '运行时配置保存失败', error.response?.data?.message || '请检查输入后重试。')
    }
    return false
  } finally {
    saving[namespace] = false
  }
}

async function saveAllChanges() {
  for (const { key } of namespaces) {
    if (isDirty(key)) {
      if (['monitor', 'scanner_health'].includes(key)) { requestSave(key); return false }
      if (!(await saveNamespace(key))) return false
    }
  }
  return true
}

useUnsavedChanges(hasUnsavedChanges, saveAllChanges)
onMounted(loadAll)
</script>

<template>
  <div class="pointer-events-none fixed right-4 top-20 z-50 flex w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:w-auto">
    <AppAlert v-for="alert in alerts" :key="alert.id" class="pointer-events-auto" v-bind="alert" @close="closeAlert(alert.id)" />
  </div>

  <div class="min-w-0 w-full p-5">
    <div class="mb-4">
      <h2 class="text-lg font-semibold">运行时配置</h2>
      <p class="text-xs opacity-60">这些策略保存在数据库中，保存后立即应用到当前进程，其他实例通常在 5 秒内同步监控策略。版本冲突时保留草稿，供对照最新配置。</p>
    </div>

    <div class="tabs tabs-box mb-5 w-full overflow-x-auto" role="tablist" aria-label="运行时配置分类">
      <button v-for="item in namespaces" :key="item.key" type="button" role="tab" :aria-selected="activeTab === item.key" class="tab whitespace-nowrap bg-white" :class="{ 'tab-active': activeTab === item.key }" @click="selectTab(item.key)">
        {{ item.title }}
      </button>
    </div>

    <section v-if="activeItem" :key="activeItem.key" class="card card-border min-w-0 border-base-300 bg-base-100 p-4">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="font-semibold">{{ activeItem.title }}</h3>
          <p class="mt-1 text-xs opacity-60">{{ activeItem.description }}</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge badge-ghost badge-sm">版本 #{{ revisions[activeItem.key] || '—' }}</span>
          <button type="button" class="btn btn-ghost btn-sm rounded-lg" :disabled="loading[activeItem.key] || saving[activeItem.key]" @click="loadNamespace(activeItem.key)">重新加载</button>
          <button type="button" class="btn btn-neutral btn-sm rounded-lg" :class="isDirty(activeItem.key) ? 'visible' : 'invisible'" :disabled="!isDirty(activeItem.key) || loading[activeItem.key] || saving[activeItem.key]" @click="requestSave(activeItem.key)">
            <span v-if="saving[activeItem.key]" class="loading loading-spinner loading-xs"></span>{{ saving[activeItem.key] ? '保存中' : policyNamespace ? '预览并保存' : '发布' }}
          </button>
        </div>
      </div>

      <div v-if="loading[activeItem.key]" class="flex items-center gap-2 py-8 text-sm opacity-60"><span class="loading loading-spinner loading-sm"></span>正在读取配置...</div>

      <div v-if="conflicts[activeItem.key]" class="alert alert-warning mb-4" role="alert"><div><p>当前配置已更新到版本 #{{ conflicts[activeItem.key].revision }}，本地草稿已保留。</p><p class="mt-1 text-xs">重新预览会对照最新版本列出全部差异，请检查是否包含其他管理员的修改。</p></div><button type="button" class="btn btn-sm" @click="reviewConflict(activeItem.key)">对照最新配置</button></div>
      <div v-if="!loading[activeItem.key] && !revisions[activeItem.key]" class="alert alert-error mb-4" role="alert">配置尚未成功加载，请点击重新加载后编辑。</div>
      <fieldset v-if="!loading[activeItem.key]" :disabled="saving[activeItem.key] || !revisions[activeItem.key] || previewNamespace !== null" class="runtime-fields min-w-0 w-full space-y-4">
        <template v-if="activeItem.key === 'requests'">
          <div class="grid gap-3 lg:grid-cols-2">
            <label class="runtime-switch rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer"><input v-model="settings.requests.enabled" type="checkbox" class="toggle mt-0.5" /><span><span class="block font-medium">采集请求日志</span><span class="mt-1 block text-xs opacity-60">关闭后停止写入新访问日志；后台 writer 保持待命。</span></span></label>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">在线保留天数</legend><input v-model.number="settings.requests.retention_days" min="1" type="number" class="input input-bordered" /><p class="label whitespace-normal opacity-60">保存后会按新版本重新安排清理。</p></fieldset>
          </div>
        </template>

        <template v-else-if="activeItem.key === 'monitor'">
          <div class="grid gap-3 lg:grid-cols-2">
            <label class="runtime-switch rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer"><input v-model="settings.monitor.enabled" type="checkbox" class="toggle mt-0.5" /><span><span class="block font-medium">启用健康监控</span><span class="mt-1 block text-xs opacity-60">关闭时不再发送健康告警。</span></span></label>
            <label class="runtime-switch rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer"><input v-model="settings.monitor.server_error_enabled" type="checkbox" class="toggle mt-0.5" /><span><span class="block font-medium">5xx 告警</span><span class="mt-1 block text-xs opacity-60">维护响应不会触发该告警。</span></span></label>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">错误告警冷却时间（秒）</legend><input v-model.number="settings.monitor.alert_cooldown_seconds" min="1" max="604800" type="number" class="input input-bordered" /><p class="label whitespace-normal opacity-60">用于 5xx 等没有操作耗时规则的错误告警。</p></fieldset>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">慢 SQL 检查间隔（秒）</legend><input v-model.number="settings.monitor.slow_sql_check_interval_seconds" min="1" max="86400" type="number" class="input input-bordered" /></fieldset>
          </div>
          <MonitorRulesEditor v-model="settings.monitor" :saved-document="savedDocuments.monitor" :catalogue="catalogue" :loading="catalogueLoading" :error="catalogueError" :sql-message="sqlMessage" @reload="loadCatalogue" />
        </template>

        <template v-else-if="activeItem.key === 'scanner_health'">
          <div class="alert text-sm" role="status">掉线策略独立于健康监控总开关。掉线及恢复邮件开关仍在系统设置的通知偏好中管理；维护、禁用及删除的扫描器不会触发掉线通知。</div>
          <p class="text-xs opacity-60">扫描器默认每 30 秒发送心跳，在线判定时间至少覆盖两个默认周期。自定义心跳周期较长时，请相应提高在线判定和告警时间。</p>
          <div class="grid gap-3 lg:grid-cols-2">
            <fieldset v-for="field in scannerHealthFields" :key="field.key" class="fieldset min-w-0"><legend class="fieldset-legend">{{ field.label }}（{{ field.unit }}）</legend><input v-model.number="settings.scanner_health[field.key]" :min="field.min" :max="field.max" step="1" type="number" class="input input-bordered" /><p class="label whitespace-normal opacity-60">{{ field.description }}</p></fieldset>
          </div>
          <p v-if="validateScannerHealth(settings.scanner_health)" class="text-sm text-error">{{ validateScannerHealth(settings.scanner_health) }}</p>
          <p class="text-xs opacity-60">持续掉线按一次事件通知，修改阈值不会重复创建已有事件；任务租约时间独立管理。</p>
        </template>

        <template v-else-if="activeItem.key === 'automatic_target'">
          <div class="rounded-lg border border-base-300 p-4 space-y-3">
            <h3 class="font-semibold">搜索触发更新</h3>
            <p class="text-xs opacity-60">主动搜索单个明确 IP 或域名时，数据缺失或过期则创建任务；翻页不触发。IP 使用下方授权范围、排除范围、端口和优先级，开关独立于周期生成。</p>
            <label class="flex items-center gap-3"><input v-model="settings.automatic_target.search_generation.enabled" type="checkbox" class="toggle" /><span>启用搜索生成</span></label>
            <div class="grid gap-3 md:grid-cols-2">
              <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">数据有效期（天）</legend><input v-model.number="settings.automatic_target.search_generation.stale_after_days" type="number" min="1" max="3650" class="input input-bordered" /></fieldset>
              <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">同一用户、目标的冷却期（分钟）</legend><input v-model.number="settings.automatic_target.search_generation.cooldown_minutes" type="number" min="1" max="525600" class="input input-bordered" /></fieldset>
              <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">搜索待执行任务上限</legend><input v-model.number="settings.automatic_target.search_generation.max_pending_tasks" type="number" min="1" max="10000" class="input input-bordered" /></fieldset>
              <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">每用户每小时创建上限</legend><input v-model.number="settings.automatic_target.search_generation.per_user_hourly_limit" type="number" min="1" max="10000" class="input input-bordered" /></fieldset>
            </div>
            <label class="flex items-center gap-3"><input v-model="settings.automatic_target.search_generation.domain_enabled" type="checkbox" class="toggle" /><span>允许域名搜索生成</span></label>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">授权域名（每行一个，包含其子域名）</legend><textarea v-model="cidrText.searchDomains" class="textarea textarea-bordered font-mono" rows="3" placeholder="example.com"></textarea><p class="label whitespace-normal opacity-60">域名生成还需启用 DNS 后续扫描；解析出的地址按 DNS 后续扫描授权范围过滤。</p></fieldset>
          </div>
          <div class="alert alert-warning alert-soft text-sm">自动目标会创建实际扫描任务。只允许填写已获得明确授权的网段；启用前请复核范围、端口和优先级。</div>
          <div class="grid gap-3 lg:grid-cols-2">
            <label class="runtime-switch rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer"><input v-model="settings.automatic_target.enabled" type="checkbox" class="toggle mt-0.5" /><span><span class="block font-medium">启用 IPv4 自动生成</span><span class="mt-1 block text-xs opacity-60">必须配置授权 IPv4 CIDR。</span></span></label>
            <label class="runtime-switch rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer"><input v-model="settings.automatic_target.ipv6_enabled" type="checkbox" class="toggle mt-0.5" /><span><span class="block font-medium">启用 IPv6 自动生成</span><span class="mt-1 block text-xs opacity-60">仅在支持 IPv6 的扫描器在线时补充。</span></span></label>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">生成间隔（秒）</legend><input v-model.number="settings.automatic_target.interval_seconds" min="5" type="number" class="input input-bordered" /></fieldset>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">IPv4 队列低水位 / 高水位</legend><div class="join"><input v-model.number="settings.automatic_target.pending_low_watermark" min="0" max="100" type="number" class="input input-bordered join-item w-1/2" /><input v-model.number="settings.automatic_target.pending_high_watermark" min="1" max="100" type="number" class="input input-bordered join-item w-1/2" /></div></fieldset>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">IPv6 队列低水位 / 高水位</legend><div class="join"><input v-model.number="settings.automatic_target.ipv6_pending_low_watermark" min="0" max="100" type="number" class="input input-bordered join-item w-1/2" /><input v-model.number="settings.automatic_target.ipv6_pending_high_watermark" min="1" max="100" type="number" class="input input-bordered join-item w-1/2" /></div></fieldset>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">优先级（0-4）</legend><input v-model.number="settings.automatic_target.priority" min="0" max="4" type="number" class="input input-bordered" /></fieldset>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">IPv4 任务前缀</legend><input v-model.number="settings.automatic_target.ipv4_task_prefix" min="0" max="32" type="number" class="input input-bordered" /></fieldset>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">IPv6 任务前缀</legend><input v-model.number="settings.automatic_target.ipv6_task_prefix" min="0" max="128" type="number" class="input input-bordered" /></fieldset>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">重复扫描间隔（秒）</legend><input v-model.number="settings.automatic_target.repeat_after_seconds" min="1" type="number" class="input input-bordered" /></fieldset>
          </div>
          <div class="grid gap-3 lg:grid-cols-2">
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">授权 IPv4 CIDR</legend><textarea v-model="cidrText.automaticAuthorized" class="textarea textarea-bordered min-h-28 font-mono text-sm" placeholder="198.51.100.0/24"></textarea></fieldset>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">排除 IPv4 CIDR</legend><textarea v-model="cidrText.automaticExcluded" class="textarea textarea-bordered min-h-28 font-mono text-sm" placeholder="198.51.100.128/25"></textarea></fieldset>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">授权 IPv6 CIDR</legend><textarea v-model="cidrText.automaticIpv6Authorized" class="textarea textarea-bordered min-h-28 font-mono text-sm" placeholder="2001:db8::/32"></textarea></fieldset>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">排除 IPv6 CIDR</legend><textarea v-model="cidrText.automaticIpv6Excluded" class="textarea textarea-bordered min-h-28 font-mono text-sm" placeholder="2001:db8:1::/48"></textarea></fieldset>
          </div>
          <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">常用端口</legend><input v-model="settings.automatic_target.common_ports" type="text" class="input input-bordered font-mono" placeholder="80,443,8080" /><p class="label whitespace-normal opacity-60">以逗号分隔，可使用范围，例如 8000-8100。</p></fieldset>
        </template>

        <template v-else-if="activeItem.key === 'dns_follow_up'">
          <div class="alert alert-warning alert-soft text-sm">此策略允许 DNS 解析结果创建端口扫描任务。必须将范围限制在已授权的 CIDR 内，排除项优先。</div>
          <div class="grid gap-3 lg:grid-cols-2">
            <label class="runtime-switch rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer"><input v-model="settings.dns_follow_up.enabled" type="checkbox" class="toggle mt-0.5" /><span><span class="block font-medium">启用 DNS 后续任务</span><span class="mt-1 block text-xs opacity-60">启用时必须配置授权 CIDR。</span></span></label>
            <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">单任务最大目标数</legend><input v-model.number="settings.dns_follow_up.max_targets_per_task" min="1" max="500" type="number" class="input input-bordered" /></fieldset>
          </div>
          <div class="grid gap-3 lg:grid-cols-2"><fieldset class="fieldset min-w-0"><legend class="fieldset-legend">授权 CIDR</legend><textarea v-model="cidrText.dnsAuthorized" class="textarea textarea-bordered min-h-28 font-mono text-sm"></textarea></fieldset><fieldset class="fieldset min-w-0"><legend class="fieldset-legend">排除 CIDR</legend><textarea v-model="cidrText.dnsExcluded" class="textarea textarea-bordered min-h-28 font-mono text-sm"></textarea></fieldset></div>
        </template>

        <template v-else-if="activeItem.key === 'dns_resolvers'">
          <div class="alert alert-info alert-soft text-sm">系统 DNS 始终可用。这里只维护额外的常用服务器；任务会保存所选服务器的配置快照。</div>
          <div class="space-y-2">
            <div v-for="(resolver, index) in settings.dns_resolvers.resolvers" :key="index" class="grid gap-2 rounded-lg border border-base-300 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_6rem_6rem_auto_auto]">
              <input v-model="resolver.id" class="input input-sm w-full" maxlength="64" placeholder="ID" />
              <input v-model="resolver.label" class="input input-sm w-full" maxlength="128" placeholder="名称" />
              <input v-model="resolver.ip" class="input input-sm w-full font-mono" placeholder="IP 地址" />
              <input v-model.number="resolver.port" class="input input-sm w-full" type="number" min="1" max="65535" aria-label="DNS 端口" />
              <select v-model="resolver.transport" class="select select-sm w-full" aria-label="DNS 传输协议"><option value="udp">UDP</option><option value="tcp">TCP</option></select>
              <label class="label cursor-pointer justify-start gap-2"><input v-model="resolver.enabled" type="checkbox" class="checkbox checkbox-sm" /><span>启用</span></label>
              <button type="button" class="btn btn-ghost btn-sm text-error" @click="removeDnsResolverPreset(index)">删除</button>
            </div>
            <button type="button" class="btn btn-outline btn-sm" :disabled="settings.dns_resolvers.resolvers.length >= 32" @click="addDnsResolverPreset">添加 DNS 服务器</button>
          </div>
        </template>

        <template v-else-if="activeItem.key === 'analytics_snapshot'">
          <div class="grid gap-3 lg:grid-cols-2"><fieldset class="fieldset min-w-0"><legend class="fieldset-legend">运行模式</legend><select v-model="settings.analytics_snapshot.mode" class="select select-bordered"><option value="realtime">realtime（实时聚合）</option><option value="shadow">shadow（后台构建快照）</option><option value="snapshot">snapshot（读取快照）</option></select><p class="label whitespace-normal opacity-60">切换为 snapshot 前请确认历史快照已构建完成。</p></fieldset><fieldset class="fieldset min-w-0"><legend class="fieldset-legend">处理间隔（分钟）</legend><input v-model.number="settings.analytics_snapshot.interval_minutes" min="1" max="1440" type="number" class="input input-bordered" /></fieldset></div>
        </template>

        <fieldset class="fieldset min-w-0"><legend class="fieldset-legend">变更原因 <span class="opacity-60">（建议填写，最长 500 字）</span></legend><input v-model="changeReasons[activeItem.key]" maxlength="500" type="text" class="input input-bordered" placeholder="例如：调整告警阈值以适应新的性能基线" /></fieldset>
      </fieldset>
      <div v-if="policyNamespace && revisions[activeItem.key]" class="mt-5 border-t border-base-300 pt-4">
        <div class="flex items-center justify-between gap-2"><div><h4 class="font-medium">配置历史</h4><p class="mt-1 text-xs opacity-60">历史版本可载入草稿，检查差异后保存为新版本。</p></div><button type="button" class="btn btn-ghost btn-sm" :disabled="historyLoading || saving[activeItem.key] || previewNamespace !== null" @click="loadHistory">{{ historyLoading ? '加载中...' : '查看最近 30 个版本' }}</button></div>
        <p v-if="historyError" class="mt-2 text-sm text-error" role="alert">{{ historyError }}</p>
        <div v-if="history.length" class="mt-3 overflow-x-auto"><table class="table table-sm"><thead><tr><th>版本</th><th>时间</th><th>变更原因</th><th></th></tr></thead><tbody><tr v-for="item in history" :key="item.revision"><td>#{{ item.revision }} <span v-if="item.revision === revisions[activeItem.key]" class="badge badge-ghost badge-xs">当前</span></td><td>{{ formatSystemDateTime(new Date(item.changed_at)) }}</td><td>{{ item.change_reason || '—' }}</td><td><button type="button" class="btn btn-ghost btn-xs" :disabled="item.revision === revisions[activeItem.key] || saving[activeItem.key] || previewNamespace !== null" @click="restoreVersion(item)">载入草稿</button></td></tr></tbody></table></div>
      </div>
    </section>
  </div>
  <div v-if="previewNamespace" class="modal modal-open" role="dialog" aria-modal="true" aria-labelledby="policy-preview-title">
    <div class="modal-box max-h-[90vh] max-w-5xl overflow-y-auto">
      <h3 id="policy-preview-title" class="text-lg font-semibold">保存前差异预览</h3>
      <p class="mt-2 text-sm opacity-70">{{ namespaces.find((item) => item.key === previewNamespace)?.title }} · 当前版本 #{{ revisions[previewNamespace] }}。保存后生效，历史告警保留原判定阈值。</p>
      <p class="mt-2 text-xs opacity-60">降低耗时阈值可能增加告警；修改服务默认规则会影响所有继承该规则的操作。</p>
      <div class="mt-4 overflow-x-auto"><table class="table table-sm"><thead><tr><th>对象</th><th>修改前</th><th>修改后</th><th>影响方式</th></tr></thead><tbody><tr v-for="(row, index) in previewRows" :key="index"><td class="min-w-48 break-all">{{ row.label }}</td><td class="min-w-48">{{ row.before }}</td><td class="min-w-48">{{ row.after }}</td><td class="whitespace-nowrap">{{ row.effect }}</td></tr></tbody></table></div>
      <p class="mt-3 text-xs opacity-60">共 {{ previewRows.length }} 项差异 · 变更原因：{{ changeReasons[previewNamespace].trim() || '未填写' }}</p>
      <div class="modal-action"><button type="button" class="btn btn-ghost" :disabled="saving[previewNamespace]" @click="previewNamespace = null">返回编辑</button><button type="button" class="btn btn-neutral" :disabled="saving[previewNamespace]" @click="confirmSave"><span v-if="saving[previewNamespace]" class="loading loading-spinner loading-xs"></span>确认保存</button></div>
    </div>
  </div>
</template>

<style scoped>
.runtime-switch {
  flex-direction: row-reverse;
  justify-content: space-between;
}

.runtime-fields .fieldset > :is(.input, .select, .textarea, .join) {
  width: 100%;
}
</style>
