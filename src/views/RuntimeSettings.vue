<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import MonitorRulesEditor from '@/components/MonitorRulesEditor.vue'
import { normalizeMonitor, policyDiff, scannerHealthDefaults, scannerHealthFields, validateMonitor, validateScannerHealth } from '@/utils/monitorRules'
import { formatDateTime as formatSystemDateTime } from '@/utils/systemTime'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import http from '@/utils/http'
import StatisticsCachePanel from '@/components/StatisticsCachePanel.vue'
import { cacheDefaults, validateCache } from '@/utils/statisticsCache'

const namespaces = [
  { key: 'requests', title: '请求日志', description: '控制访问日志采集和在线保留期。' },
  { key: 'monitor', title: '服务监控与告警', description: '按服务和具体操作管理耗时阈值、告警级别及冷却时间。' },
  { key: 'scanner_health', title: '扫描器状态与告警', description: '管理心跳判定、掉线告警、维护宽限期和通信延迟标识。' },
  { key: 'automatic_target', title: '自动扫描策略', description: '管理搜索触发与周期生成的扫描任务，以及授权范围和任务参数。' },
  { key: 'dns_follow_up', title: 'DNS 解析后扫描', description: '控制 DNS 解析结果自动创建端口扫描任务的范围。' },
  { key: 'dns_resolvers', title: 'DNS 解析服务器', description: '维护创建域名扫描任务时可选择的常用 DNS 解析服务器。' },
  { key: 'statistics_cache', title: '统计缓存', description: '配置缓存有效期、容量及查询结果复用，查看实例状态。' },
  { key: 'report_mail', title: '报告邮件', description: '配置报告详情地址、远程趋势图片和扫描器展示数量。' },
  { key: 'analytics_snapshot', title: '分析模式与快照', description: '选择分析数据的读取模式与后台快照处理间隔。' },
]

const namespaceGroups = [
  { title: '日志与监控', keys: ['requests', 'monitor', 'scanner_health'] },
  { title: '扫描与解析', keys: ['automatic_target', 'dns_follow_up', 'dns_resolvers'] },
  { title: '数据分析', keys: ['analytics_snapshot', 'statistics_cache', 'report_mail'] },
].map((group) => ({ ...group, items: group.keys.map((key) => namespaces.find((item) => item.key === key)) }))

const scannerHealthSections = [
  { title: '在线判定', description: '根据最后一次心跳确定扫描器是否在线。默认心跳周期为 30 秒，判定时间至少覆盖两个周期。', keys: ['offline_after_seconds'] },
  { title: '掉线告警与维护宽限', description: '持续掉线按一次事件通知，维护结束后预留恢复连接的时间。', keys: ['alert_after_seconds', 'check_interval_seconds', 'maintenance_grace_seconds'] },
  { title: '通信延迟', description: '控制扫描器列表和详情中的延迟级别及样本有效期。', keys: ['latency_warning_ms', 'latency_critical_ms', 'latency_stale_after_seconds'] },
].map((section) => ({ ...section, fields: section.keys.map((key) => scannerHealthFields.find((field) => field.key === key)) }))

const analyticsModes = [
  { value: 'realtime', label: '实时聚合（realtime）', description: '直接聚合当前数据用于分析。' },
  { value: 'shadow', label: '后台构建快照（shadow）', description: '继续使用实时聚合，同时在后台构建快照，为切换读取模式做准备。' },
  { value: 'snapshot', label: '读取快照（snapshot）', description: '使用已构建的快照提供分析结果；切换前请确认历史快照已完成构建。' },
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
  report_mail: { public_base_url: '', remote_images_enabled: false, image_lifetime_days: 365, scanner_row_limit: 20 },
  analytics_snapshot: { mode: 'realtime', interval_minutes: 30 },
  statistics_cache: cacheDefaults,
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
const navigationDisabled = computed(() => previewNamespace.value !== null || namespaces.some(({ key }) => saving[key]))
const unsavedCount = computed(() => namespaces.filter(({ key }) => isDirty(key)).length)

function selectTab(namespace) {
  if (navigationDisabled.value || namespace === activeTab.value) return
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
    if (!silent) pushAlert('error', '运行策略加载失败', `${namespaces.find((item) => item.key === namespace)?.title}：${error.response?.data?.message || '请检查服务端连接。'}`)
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
    catalogueError.value = '操作目录加载失败，请重试后保存服务监控规则。'
  } finally {
    catalogueLoading.value = false
  }
}

function validationError(namespace) {
  if (namespace === 'statistics_cache') return validateCache(settings.statistics_cache)
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
  if (historyLoading.value) return
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

function handleHistoryToggle(event) {
  if (event.target.open && !history.value.length && !historyLoading.value) loadHistory()
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
    pushAlert('success', '运行策略已保存', `${namespaces.find((item) => item.key === namespace)?.title}已应用，当前版本为 #${data.revision}。`)
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
      pushAlert('error', '运行策略保存失败', error.response?.data?.message || '请检查输入后重试。')
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
    <div class="mb-5">
      <h2 class="text-lg font-semibold">运行策略</h2>
      <p class="mt-1 text-xs opacity-60">管理日志、监控告警、自动扫描与分析策略，保存后生效。</p>
    </div>

    <div class="grid min-w-0 items-start gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="运行策略分类" class="card card-border min-w-0 border-base-300 bg-base-100 p-3 lg:sticky lg:top-20">
        <fieldset class="fieldset lg:hidden">
          <legend class="fieldset-legend"><label for="policy-category">策略分类</label></legend>
          <select id="policy-category" :value="activeTab" class="select w-full" :disabled="navigationDisabled" @change="selectTab($event.target.value)">
            <optgroup v-for="group in namespaceGroups" :key="group.title" :label="group.title">
              <option v-for="item in group.items" :key="item.key" :value="item.key">{{ item.title }}{{ isDirty(item.key) ? ' · 未保存' : '' }}</option>
            </optgroup>
          </select>
        </fieldset>
        <ul class="menu policy-menu hidden w-full p-0 lg:flex">
          <template v-for="group in namespaceGroups" :key="group.title">
            <li class="menu-title">{{ group.title }}</li>
            <li v-for="item in group.items" :key="item.key">
              <button type="button" class="flex justify-between gap-2" :class="{ 'menu-active': activeTab === item.key }" :aria-current="activeTab === item.key ? 'true' : undefined" :disabled="navigationDisabled" @click="selectTab(item.key)">
                <span>{{ item.title }}</span>
                <span v-if="isDirty(item.key)" class="badge badge-warning badge-xs shrink-0" aria-label="有未保存的更改">未保存</span>
              </button>
            </li>
          </template>
        </ul>
        <p v-if="unsavedCount" class="mt-3 border-t border-base-300 pt-3 text-xs opacity-70" role="status">{{ unsavedCount }} 项策略有未保存的更改，切换分类会保留草稿。</p>
      </nav>

      <section v-if="activeItem" :key="activeItem.key" aria-labelledby="active-policy-title" class="card card-border min-w-0 border-base-300 bg-base-100 p-4 sm:p-5">
        <div class="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-base-300 pb-4">
          <div class="min-w-0">
            <h3 id="active-policy-title" class="font-semibold">{{ activeItem.title }}</h3>
            <p class="mt-1 text-xs opacity-60">{{ activeItem.description }}</p>
          </div>
          <span class="badge badge-ghost badge-sm shrink-0">已保存版本 #{{ revisions[activeItem.key] || '—' }}</span>
        </div>

        <div v-if="loading[activeItem.key]" class="flex items-center gap-2 py-8 text-sm opacity-60" role="status"><span class="loading loading-spinner loading-sm"></span>正在读取策略...</div>
        <div v-if="conflicts[activeItem.key]" class="alert alert-warning mb-4 flex flex-col items-start sm:flex-row sm:items-center" role="alert">
          <div><p>策略已被其他管理员更新，本地草稿已保留。</p><p class="mt-1 text-xs">请对照最新版本检查差异，再保存更改。</p></div>
          <button type="button" class="btn btn-sm shrink-0" :disabled="navigationDisabled || loading[activeItem.key]" @click="reviewConflict(activeItem.key)">对照最新策略</button>
        </div>
        <div v-if="!loading[activeItem.key] && !revisions[activeItem.key]" class="alert alert-error mb-4" role="alert">策略尚未成功加载，请点击底部的“重新加载”后编辑。</div>

        <fieldset v-if="!loading[activeItem.key]" :disabled="saving[activeItem.key] || !revisions[activeItem.key] || previewNamespace !== null" class="runtime-fields min-w-0 w-full space-y-5">
          <template v-if="activeItem.key === 'requests'">
            <div class="grid gap-3 md:grid-cols-2">
              <section class="space-y-3 rounded-lg border border-base-300 p-4">
                <div>
                  <h4 class="font-semibold">日志采集</h4>
                  <p class="mt-1 text-xs opacity-60">控制新访问日志的采集。</p>
                </div>
                <label class="runtime-switch rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer">
                  <input v-model="settings.requests.enabled" type="checkbox" class="toggle mt-0.5" />
                  <span><span class="block font-medium">采集请求日志</span><span class="mt-1 block text-xs opacity-60">关闭后停止写入新访问日志；后台写入服务保持待命。</span></span>
                </label>
              </section>
              <section class="space-y-3 rounded-lg border border-base-300 p-4">
                <div>
                  <h4 class="font-semibold">保留期限</h4>
                  <p class="mt-1 text-xs opacity-60">控制请求日志的在线保留时间。</p>
                </div>
                <fieldset class="fieldset min-w-0">
                  <legend class="fieldset-legend"><label for="policy-settings-requests-retention-days">在线保留天数</label></legend>
                  <input id="policy-settings-requests-retention-days" v-model.number="settings.requests.retention_days" type="number" class="input input-bordered" min="1" />
                  <p class="label whitespace-normal opacity-60">保存后会按新版本重新安排清理。</p>
                </fieldset>
              </section>
            </div>
          </template>

          <template v-else-if="activeItem.key === 'monitor'">
            <section class="space-y-3 rounded-lg border border-base-300 p-4">
              <div>
                <h4 class="font-semibold">基础监控与错误告警</h4>
                <p class="mt-1 text-xs opacity-60">管理监控总开关、5xx 错误告警和慢 SQL 检查频率。</p>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <label class="runtime-switch rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer">
                  <input v-model="settings.monitor.enabled" type="checkbox" class="toggle mt-0.5" />
                  <span><span class="block font-medium">启用服务监控</span><span class="mt-1 block text-xs opacity-60">关闭后不再发送服务监控告警。</span></span>
                </label>
                <label class="runtime-switch rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer">
                  <input v-model="settings.monitor.server_error_enabled" type="checkbox" class="toggle mt-0.5" />
                  <span><span class="block font-medium">5xx 错误告警</span><span class="mt-1 block text-xs opacity-60">维护响应不会触发该告警。</span></span>
                </label>
                <fieldset class="fieldset min-w-0">
                  <legend class="fieldset-legend"><label for="policy-settings-monitor-alert-cooldown-seconds">错误告警冷却时间（秒）</label></legend>
                  <input id="policy-settings-monitor-alert-cooldown-seconds" v-model.number="settings.monitor.alert_cooldown_seconds" type="number" class="input input-bordered" min="1" max="604800" />
                  <p class="label whitespace-normal opacity-60">用于 5xx 等没有操作耗时规则的错误告警。</p>
                </fieldset>
                <fieldset class="fieldset min-w-0">
                  <legend class="fieldset-legend"><label for="policy-settings-monitor-slow-sql-check-interval-seconds">慢 SQL 检查间隔（秒）</label></legend>
                  <input id="policy-settings-monitor-slow-sql-check-interval-seconds" v-model.number="settings.monitor.slow_sql_check_interval_seconds" type="number" class="input input-bordered" min="1" max="86400" />
                </fieldset>
              </div>
            </section>
            <MonitorRulesEditor v-model="settings.monitor" :saved-document="savedDocuments.monitor" :catalogue="catalogue" :loading="catalogueLoading" :error="catalogueError" :sql-message="sqlMessage" @reload="loadCatalogue" />
          </template>

          <template v-else-if="activeItem.key === 'scanner_health'">
            <div class="alert text-sm" role="status">掉线策略独立于服务监控总开关。掉线与恢复邮件开关在系统设置的通知偏好中管理；维护、禁用及删除的扫描器不会触发掉线通知。</div>
            <section v-for="section in scannerHealthSections" :key="section.title" class="space-y-3 rounded-lg border border-base-300 p-4">
              <div>
                <h4 class="font-semibold">{{ section.title }}</h4>
                <p class="mt-1 text-xs opacity-60">{{ section.description }}</p>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <fieldset v-for="field in section.fields" :key="field.key" class="fieldset min-w-0">
                  <legend class="fieldset-legend"><label :for="`scanner-health-${field.key}`">{{ field.label }}（{{ field.unit }}）</label></legend>
                  <input :id="`scanner-health-${field.key}`" v-model.number="settings.scanner_health[field.key]" :min="field.min" :max="field.max" step="1" type="number" class="input input-bordered" />
                  <p class="label whitespace-normal opacity-60">{{ field.description }}</p>
                </fieldset>
              </div>
            </section>
            <p v-if="validateScannerHealth(settings.scanner_health)" class="text-sm text-error" role="alert">{{ validateScannerHealth(settings.scanner_health) }}</p>
            <p class="text-xs opacity-60">修改阈值不会重复创建已有掉线事件；任务租约时间独立管理。自定义心跳周期较长时，请相应提高在线判定和告警时间。</p>
          </template>

          <template v-else-if="activeItem.key === 'automatic_target'">
            <div class="alert alert-warning alert-soft text-sm" role="status">自动扫描会创建实际任务。只允许填写已获得明确授权的网段；启用前请复核范围、端口和优先级。</div>
            <section class="space-y-3 rounded-lg border border-base-300 p-4">
              <div>
                <h4 class="font-semibold">搜索触发扫描</h4>
                <p class="mt-1 text-xs opacity-60">主动搜索单个明确 IP 或域名时，数据缺失或过期则创建任务；翻页不会触发。</p>
              </div>
              <label class="runtime-switch rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer">
                <input v-model="settings.automatic_target.search_generation.enabled" type="checkbox" class="toggle mt-0.5" />
                <span><span class="block font-medium">启用搜索触发扫描</span><span class="mt-1 block text-xs opacity-60">任务使用下方的授权范围、排除范围、端口和优先级，与周期扫描开关独立。</span></span>
              </label>
              <div class="grid gap-3 md:grid-cols-2">
                <fieldset class="fieldset min-w-0">
                  <legend class="fieldset-legend"><label for="policy-settings-automatic-target-search-generation-stale-after-days">数据有效期（天）</label></legend>
                  <input id="policy-settings-automatic-target-search-generation-stale-after-days" v-model.number="settings.automatic_target.search_generation.stale_after_days" type="number" class="input input-bordered" min="1" max="3650" />
                </fieldset>
                <fieldset class="fieldset min-w-0">
                  <legend class="fieldset-legend"><label for="policy-settings-automatic-target-search-generation-cooldown-minutes">同一用户、目标的冷却期（分钟）</label></legend>
                  <input id="policy-settings-automatic-target-search-generation-cooldown-minutes" v-model.number="settings.automatic_target.search_generation.cooldown_minutes" type="number" class="input input-bordered" min="1" max="525600" />
                </fieldset>
                <fieldset class="fieldset min-w-0">
                  <legend class="fieldset-legend"><label for="policy-settings-automatic-target-search-generation-max-pending-tasks">搜索待执行任务上限</label></legend>
                  <input id="policy-settings-automatic-target-search-generation-max-pending-tasks" v-model.number="settings.automatic_target.search_generation.max_pending_tasks" type="number" class="input input-bordered" min="1" max="10000" />
                </fieldset>
                <fieldset class="fieldset min-w-0">
                  <legend class="fieldset-legend"><label for="policy-settings-automatic-target-search-generation-per-user-hourly-limit">每用户每小时创建上限</label></legend>
                  <input id="policy-settings-automatic-target-search-generation-per-user-hourly-limit" v-model.number="settings.automatic_target.search_generation.per_user_hourly_limit" type="number" class="input input-bordered" min="1" max="10000" />
                </fieldset>
              </div>
              <label class="runtime-switch rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer">
                <input v-model="settings.automatic_target.search_generation.domain_enabled" type="checkbox" class="toggle mt-0.5" />
                <span><span class="block font-medium">允许域名搜索触发扫描</span><span class="mt-1 block text-xs opacity-60">还需启用 DNS 解析后扫描；解析出的地址按其授权范围过滤。</span></span>
              </label>
              <fieldset class="fieldset min-w-0">
                <legend class="fieldset-legend"><label for="policy-cidrText-searchDomains">授权域名（每行一个，包含其子域名）</label></legend>
                <textarea id="policy-cidrText-searchDomains" v-model="cidrText.searchDomains" class="textarea textarea-bordered font-mono min-h-28" placeholder="example.com"></textarea>
              </fieldset>
            </section>
            <section class="space-y-3 rounded-lg border border-base-300 p-4">
              <div>
                <h4 class="font-semibold">周期扫描</h4>
                <p class="mt-1 text-xs opacity-60">按队列水位持续补充任务，IPv4 与 IPv6 可分别启用。</p>
              </div>
              <fieldset class="fieldset min-w-0">
                <legend class="fieldset-legend"><label for="policy-settings-automatic-target-interval-seconds">生成间隔（秒）</label></legend>
                <input id="policy-settings-automatic-target-interval-seconds" v-model.number="settings.automatic_target.interval_seconds" type="number" class="input input-bordered" min="5" />
              </fieldset>
              <section class="space-y-3 rounded-lg border border-base-300 p-4">
                <div>
                  <h5 class="font-semibold">IPv4 周期扫描与授权范围</h5>
                  <p class="mt-1 text-xs opacity-60">授权与排除范围同时用于搜索触发扫描；排除项优先。</p>
                </div>
                <label class="runtime-switch rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer">
                  <input v-model="settings.automatic_target.enabled" type="checkbox" class="toggle mt-0.5" />
                  <span><span class="block font-medium">启用 IPv4 周期扫描</span><span class="mt-1 block text-xs opacity-60">必须配置已授权的 IPv4 CIDR。</span></span>
                </label>
                <div class="grid gap-3 md:grid-cols-2">
                  <fieldset class="fieldset min-w-0">
                    <legend class="fieldset-legend"><label for="policy-settings-automatic-target-pending-low-watermark">IPv4 队列低水位</label></legend>
                    <input id="policy-settings-automatic-target-pending-low-watermark" v-model.number="settings.automatic_target.pending_low_watermark" type="number" class="input input-bordered" min="0" max="100" />
                  </fieldset>
                  <fieldset class="fieldset min-w-0">
                    <legend class="fieldset-legend"><label for="policy-settings-automatic-target-pending-high-watermark">IPv4 队列高水位</label></legend>
                    <input id="policy-settings-automatic-target-pending-high-watermark" v-model.number="settings.automatic_target.pending_high_watermark" type="number" class="input input-bordered" min="1" max="100" />
                  </fieldset>
                  <fieldset class="fieldset min-w-0">
                    <legend class="fieldset-legend"><label for="policy-settings-automatic-target-ipv4-task-prefix">IPv4 任务前缀</label></legend>
                    <input id="policy-settings-automatic-target-ipv4-task-prefix" v-model.number="settings.automatic_target.ipv4_task_prefix" type="number" class="input input-bordered" min="0" max="32" />
                  </fieldset>
                </div>
                <div class="grid gap-3 md:grid-cols-2">
                  <fieldset class="fieldset min-w-0">
                    <legend class="fieldset-legend"><label for="policy-cidrText-automaticAuthorized">授权 IPv4 CIDR</label></legend>
                    <textarea id="policy-cidrText-automaticAuthorized" v-model="cidrText.automaticAuthorized" class="textarea textarea-bordered font-mono min-h-28" placeholder="198.51.100.0/24"></textarea>
                  </fieldset>
                  <fieldset class="fieldset min-w-0">
                    <legend class="fieldset-legend"><label for="policy-cidrText-automaticExcluded">排除 IPv4 CIDR</label></legend>
                    <textarea id="policy-cidrText-automaticExcluded" v-model="cidrText.automaticExcluded" class="textarea textarea-bordered font-mono min-h-28" placeholder="198.51.100.128/25"></textarea>
                  </fieldset>
                </div>
              </section>
              <section class="space-y-3 rounded-lg border border-base-300 p-4">
                <div>
                  <h5 class="font-semibold">IPv6 周期扫描与授权范围</h5>
                  <p class="mt-1 text-xs opacity-60">仅在支持 IPv6 的扫描器在线时补充任务；排除项优先。</p>
                </div>
                <label class="runtime-switch rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer">
                  <input v-model="settings.automatic_target.ipv6_enabled" type="checkbox" class="toggle mt-0.5" />
                  <span><span class="block font-medium">启用 IPv6 周期扫描</span><span class="mt-1 block text-xs opacity-60">必须配置已授权的 IPv6 CIDR。</span></span>
                </label>
                <div class="grid gap-3 md:grid-cols-2">
                  <fieldset class="fieldset min-w-0">
                    <legend class="fieldset-legend"><label for="policy-settings-automatic-target-ipv6-pending-low-watermark">IPv6 队列低水位</label></legend>
                    <input id="policy-settings-automatic-target-ipv6-pending-low-watermark" v-model.number="settings.automatic_target.ipv6_pending_low_watermark" type="number" class="input input-bordered" min="0" max="100" />
                  </fieldset>
                  <fieldset class="fieldset min-w-0">
                    <legend class="fieldset-legend"><label for="policy-settings-automatic-target-ipv6-pending-high-watermark">IPv6 队列高水位</label></legend>
                    <input id="policy-settings-automatic-target-ipv6-pending-high-watermark" v-model.number="settings.automatic_target.ipv6_pending_high_watermark" type="number" class="input input-bordered" min="1" max="100" />
                  </fieldset>
                  <fieldset class="fieldset min-w-0">
                    <legend class="fieldset-legend"><label for="policy-settings-automatic-target-ipv6-task-prefix">IPv6 任务前缀</label></legend>
                    <input id="policy-settings-automatic-target-ipv6-task-prefix" v-model.number="settings.automatic_target.ipv6_task_prefix" type="number" class="input input-bordered" min="0" max="128" />
                  </fieldset>
                </div>
                <div class="grid gap-3 md:grid-cols-2">
                  <fieldset class="fieldset min-w-0">
                    <legend class="fieldset-legend"><label for="policy-cidrText-automaticIpv6Authorized">授权 IPv6 CIDR</label></legend>
                    <textarea id="policy-cidrText-automaticIpv6Authorized" v-model="cidrText.automaticIpv6Authorized" class="textarea textarea-bordered font-mono min-h-28" placeholder="2001:db8::/32"></textarea>
                  </fieldset>
                  <fieldset class="fieldset min-w-0">
                    <legend class="fieldset-legend"><label for="policy-cidrText-automaticIpv6Excluded">排除 IPv6 CIDR</label></legend>
                    <textarea id="policy-cidrText-automaticIpv6Excluded" v-model="cidrText.automaticIpv6Excluded" class="textarea textarea-bordered font-mono min-h-28" placeholder="2001:db8:1::/48"></textarea>
                  </fieldset>
                </div>
              </section>
            </section>
            <section class="space-y-3 rounded-lg border border-base-300 p-4">
              <div>
                <h4 class="font-semibold">公共任务参数</h4>
                <p class="mt-1 text-xs opacity-60">用于自动扫描任务的端口选择、调度优先级和重复扫描间隔。</p>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <fieldset class="fieldset min-w-0">
                  <legend class="fieldset-legend"><label for="policy-settings-automatic-target-common-ports">常用端口</label></legend>
                  <input id="policy-settings-automatic-target-common-ports" v-model="settings.automatic_target.common_ports" type="text" class="input input-bordered" placeholder="80,443,8080" />
                  <p class="label whitespace-normal opacity-60">以逗号分隔，可使用范围，例如 8000-8100。</p>
                </fieldset>
                <fieldset class="fieldset min-w-0">
                  <legend class="fieldset-legend"><label for="policy-settings-automatic-target-priority">优先级（0–4）</label></legend>
                  <input id="policy-settings-automatic-target-priority" v-model.number="settings.automatic_target.priority" type="number" class="input input-bordered" min="0" max="4" />
                </fieldset>
                <fieldset class="fieldset min-w-0">
                  <legend class="fieldset-legend"><label for="policy-settings-automatic-target-repeat-after-seconds">重复扫描间隔（秒）</label></legend>
                  <input id="policy-settings-automatic-target-repeat-after-seconds" v-model.number="settings.automatic_target.repeat_after_seconds" type="number" class="input input-bordered" min="1" />
                </fieldset>
              </div>
            </section>
          </template>

          <template v-else-if="activeItem.key === 'dns_follow_up'">
            <div class="alert alert-warning alert-soft text-sm" role="status">此策略允许 DNS 解析结果创建端口扫描任务。必须将范围限制在已授权的 CIDR 内，排除项优先。</div>
            <section class="space-y-3 rounded-lg border border-base-300 p-4">
              <div>
                <h4 class="font-semibold">启用条件与任务限制</h4>
                <p class="mt-1 text-xs opacity-60">控制解析后扫描的开关及每个任务的目标数量。</p>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <label class="runtime-switch rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer">
                  <input v-model="settings.dns_follow_up.enabled" type="checkbox" class="toggle mt-0.5" />
                  <span><span class="block font-medium">启用 DNS 解析后扫描</span><span class="mt-1 block text-xs opacity-60">解析完成后，仅对授权范围内的地址创建端口扫描任务。</span></span>
                </label>
                <fieldset class="fieldset min-w-0">
                  <legend class="fieldset-legend"><label for="policy-settings-dns-follow-up-max-targets-per-task">单任务最大目标数</label></legend>
                  <input id="policy-settings-dns-follow-up-max-targets-per-task" v-model.number="settings.dns_follow_up.max_targets_per_task" type="number" class="input input-bordered" min="1" max="500" />
                </fieldset>
              </div>
            </section>
            <section class="space-y-3 rounded-lg border border-base-300 p-4">
              <div>
                <h4 class="font-semibold">授权与排除范围</h4>
                <p class="mt-1 text-xs opacity-60">每行填写一个 CIDR，排除项优先于授权项。</p>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <fieldset class="fieldset min-w-0">
                  <legend class="fieldset-legend"><label for="policy-cidrText-dnsAuthorized">授权 CIDR</label></legend>
                  <textarea id="policy-cidrText-dnsAuthorized" v-model="cidrText.dnsAuthorized" class="textarea textarea-bordered font-mono min-h-28"></textarea>
                </fieldset>
                <fieldset class="fieldset min-w-0">
                  <legend class="fieldset-legend"><label for="policy-cidrText-dnsExcluded">排除 CIDR</label></legend>
                  <textarea id="policy-cidrText-dnsExcluded" v-model="cidrText.dnsExcluded" class="textarea textarea-bordered font-mono min-h-28"></textarea>
                </fieldset>
              </div>
            </section>
          </template>

          <template v-else-if="activeItem.key === 'dns_resolvers'">
            <div class="alert alert-info alert-soft text-sm" role="status">系统 DNS 始终可用。这里只维护额外的常用解析服务器；任务会保存所选服务器的配置快照。</div>
            <section class="space-y-3 rounded-lg border border-base-300 p-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div><h4 class="font-semibold">常用解析服务器</h4><p class="mt-1 text-xs opacity-60">已配置 {{ settings.dns_resolvers.resolvers.length }} / 32 个服务器。</p></div>
                <button type="button" class="btn btn-outline btn-sm" :disabled="settings.dns_resolvers.resolvers.length >= 32" @click="addDnsResolverPreset">添加解析服务器</button>
              </div>
              <p v-if="!settings.dns_resolvers.resolvers.length" class="py-4 text-sm opacity-60">尚未添加额外的解析服务器，创建任务时仍可使用系统 DNS。</p>
              <div v-for="(resolver, index) in settings.dns_resolvers.resolvers" :key="index" class="space-y-3 rounded-lg border border-base-300 p-3">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <h5 class="text-sm font-medium">解析服务器 {{ index + 1 }}</h5>
                  <div class="flex items-center gap-3">
                    <label class="flex cursor-pointer items-center gap-2 text-sm"><input v-model="resolver.enabled" type="checkbox" class="toggle toggle-sm" /><span>启用</span></label>
                    <button type="button" class="btn btn-ghost btn-sm text-error" @click="removeDnsResolverPreset(index)">删除</button>
                  </div>
                </div>
                <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <fieldset class="fieldset min-w-0">
                    <legend class="fieldset-legend"><label :for="`resolver-id-${index}`">标识（ID）</label></legend>
                    <input :id="`resolver-id-${index}`" v-model="resolver.id" class="input input-sm" maxlength="64" placeholder="例如：dns-1" />
                  </fieldset>
                  <fieldset class="fieldset min-w-0">
                    <legend class="fieldset-legend"><label :for="`resolver-label-${index}`">名称</label></legend>
                    <input :id="`resolver-label-${index}`" v-model="resolver.label" class="input input-sm" maxlength="128" placeholder="服务器名称" />
                  </fieldset>
                  <fieldset class="fieldset min-w-0">
                    <legend class="fieldset-legend"><label :for="`resolver-ip-${index}`">IP 地址</label></legend>
                    <input :id="`resolver-ip-${index}`" v-model="resolver.ip" class="input input-sm font-mono" placeholder="例如：192.0.2.53" />
                  </fieldset>
                  <fieldset class="fieldset min-w-0">
                    <legend class="fieldset-legend"><label :for="`resolver-port-${index}`">端口</label></legend>
                    <input :id="`resolver-port-${index}`" v-model.number="resolver.port" class="input input-sm" type="number" min="1" max="65535" />
                  </fieldset>
                  <fieldset class="fieldset min-w-0">
                    <legend class="fieldset-legend"><label :for="`resolver-transport-${index}`">传输协议</label></legend>
                    <select :id="`resolver-transport-${index}`" v-model="resolver.transport" class="select select-sm"><option value="udp">UDP</option><option value="tcp">TCP</option></select>
                  </fieldset>
                </div>
              </div>
            </section>
          </template>

          <StatisticsCachePanel v-else-if="activeItem.key === 'statistics_cache'" v-model="settings.statistics_cache" :revision="revisions.statistics_cache" :dirty="isDirty('statistics_cache')" @cleared="(data) => applyDocument('statistics_cache', data.document, data.revision)" />
          <template v-else-if="activeItem.key === 'report_mail'">
            <section class="space-y-3 rounded-lg border border-base-300 p-4">
              <h4 class="font-semibold">报告链接与趋势图片</h4>
              <fieldset class="fieldset min-w-0">
                <legend class="fieldset-legend"><label for="report-mail-url">平台外部 HTTPS 地址</label></legend>
                <input id="report-mail-url" v-model="settings.report_mail.public_base_url" type="url" class="input input-bordered w-full" placeholder="https://reports.example.com" />
                <p class="label whitespace-normal opacity-60">可包含部署路径。用于邮件中的完整报告链接和趋势图片；地址需要能被收件人的邮箱访问。</p>
              </fieldset>
              <label class="flex items-center gap-3 text-sm"><input v-model="settings.report_mail.remote_images_enabled" type="checkbox" class="toggle toggle-neutral" />在新报告邮件中加载远程趋势图</label>
              <p class="text-xs opacity-60">趋势图展示每日任务数量。图片未加载时仍可阅读每日统计表；完整报告需要登录。关闭此设置不撤销已归档图片。</p>
            </section>
            <section class="grid gap-4 rounded-lg border border-base-300 p-4 sm:grid-cols-2">
              <fieldset class="fieldset min-w-0"><legend class="fieldset-legend"><label for="report-mail-lifetime">图片有效期（天）</label></legend><input id="report-mail-lifetime" v-model.number="settings.report_mail.image_lifetime_days" type="number" min="1" max="3650" class="input input-bordered" /><p class="label whitespace-normal opacity-60">重发会延长未撤销图片的有效期。已归档报告保留生成时的有效期设置。</p></fieldset>
              <fieldset class="fieldset min-w-0"><legend class="fieldset-legend"><label for="report-mail-scanners">扫描器展示上限</label></legend><input id="report-mail-scanners" v-model.number="settings.report_mail.scanner_row_limit" type="number" min="1" max="100" class="input input-bordered" /><p class="label whitespace-normal opacity-60">超出时显示剩余数量，可登录查看完整列表。</p></fieldset>
            </section>
            <p class="text-sm opacity-60">设置只影响新生成报告。邮件模板编辑器可载入新版默认模板，再保存并发布；已有报告使用归档正文。</p>
          </template>
          <template v-else-if="activeItem.key === 'analytics_snapshot'">
            <section class="space-y-3 rounded-lg border border-base-300 p-4">
              <div>
                <h4 class="font-semibold">分析数据读取模式</h4>
                <p class="mt-1 text-xs opacity-60">选择实时聚合或读取已构建的分析快照。</p>
              </div>
              <fieldset class="fieldset min-w-0">
                <legend class="fieldset-legend"><label for="analytics-mode">运行模式</label></legend>
                <select id="analytics-mode" v-model="settings.analytics_snapshot.mode" class="select select-bordered">
                  <option v-for="mode in analyticsModes" :key="mode.value" :value="mode.value">{{ mode.label }}</option>
                </select>
                <p class="label whitespace-normal opacity-60">{{ analyticsModes.find((mode) => mode.value === settings.analytics_snapshot.mode)?.description }}</p>
              </fieldset>
            </section>
            <section class="space-y-3 rounded-lg border border-base-300 p-4">
              <div>
                <h4 class="font-semibold">历史补偿与快照回填</h4>
                <p class="mt-1 text-xs opacity-60">设置历史补偿检查和下一轮回填范围的建立周期。</p>
              </div>
              <fieldset class="fieldset min-w-0">
                <legend class="fieldset-legend"><label for="policy-settings-analytics-snapshot-interval-minutes">历史补偿检查间隔（分钟）</label></legend>
                <input id="policy-settings-analytics-snapshot-interval-minutes" v-model.number="settings.analytics_snapshot.interval_minutes" type="number" class="input input-bordered" min="1" max="1440" />
                <p class="label whitespace-normal opacity-60">用于后台构建快照与读取快照模式；实时聚合模式不使用此间隔。此间隔不控制队列消费速度。</p>
              </fieldset>
            </section>
          </template>
          <div class="border-t border-base-300 pt-4">
            <fieldset class="fieldset min-w-0">
              <legend class="fieldset-legend"><label for="policy-change-reason">变更原因 <span class="font-normal opacity-60">（可选）</span></label></legend>
              <input id="policy-change-reason" v-model="changeReasons[activeItem.key]" maxlength="500" type="text" class="input input-bordered" placeholder="例如：调整告警阈值以适应新的性能基线" />
              <p class="label whitespace-normal opacity-60">最长 500 字，用于记录本次策略调整的原因。</p>
            </fieldset>
          </div>
        </fieldset>

        <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-4">
          <div class="text-xs opacity-60" role="status">
            <p v-if="loading[activeItem.key]">正在加载...</p>
            <p v-else-if="!revisions[activeItem.key]">加载后可编辑并保存。</p>
            <p v-else-if="saving[activeItem.key]">正在保存更改...</p>
            <p v-else>{{ isDirty(activeItem.key) ? '有未保存的更改' : '所有更改已保存' }}</p>
            <p class="mt-1">保存后应用到当前进程，其他实例通常在 5 秒内同步监控及统计缓存策略。</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="btn btn-ghost btn-sm rounded-lg" :disabled="loading[activeItem.key] || navigationDisabled" @click="loadNamespace(activeItem.key)">重新加载</button>
            <button type="button" class="btn btn-neutral btn-sm rounded-lg" :disabled="!isDirty(activeItem.key) || !revisions[activeItem.key] || loading[activeItem.key] || navigationDisabled" @click="requestSave(activeItem.key)">
              <span v-if="saving[activeItem.key]" class="loading loading-spinner loading-xs"></span>{{ saving[activeItem.key] ? '保存中' : policyNamespace ? '预览并保存' : '保存更改' }}
            </button>
          </div>
        </div>

        <details v-if="policyNamespace && revisions[activeItem.key]" class="collapse collapse-arrow mt-5 border border-base-300" @toggle="handleHistoryToggle">
          <summary class="collapse-title text-sm font-medium">配置历史</summary>
          <div class="collapse-content">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs opacity-60">最近 30 个版本。历史配置可载入草稿，检查差异后保存为新版本。</p>
              <button type="button" class="btn btn-ghost btn-sm" :disabled="historyLoading || navigationDisabled" @click="loadHistory">{{ historyLoading ? '加载中...' : '刷新历史' }}</button>
            </div>
            <p v-if="historyLoading" class="mt-3 text-sm opacity-60" role="status">正在加载历史...</p>
            <p v-else-if="historyError" class="mt-3 text-sm text-error" role="alert">{{ historyError }}</p>
            <div v-else-if="history.length" class="mt-3 overflow-x-auto">
              <table class="table table-sm">
                <thead><tr><th>版本</th><th>时间</th><th>变更原因</th><th>操作</th></tr></thead>
                <tbody>
                  <tr v-for="item in history" :key="item.revision">
                    <td>#{{ item.revision }} <span v-if="item.revision === revisions[activeItem.key]" class="badge badge-ghost badge-xs">当前</span></td>
                    <td>{{ formatSystemDateTime(new Date(item.changed_at)) }}</td>
                    <td>{{ item.change_reason || '—' }}</td>
                    <td><button type="button" class="btn btn-ghost btn-xs" :disabled="item.revision === revisions[activeItem.key] || loading[activeItem.key] || navigationDisabled" @click="restoreVersion(item)">载入草稿</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="mt-3 text-sm opacity-60">暂无配置历史。</p>
          </div>
        </details>
      </section>
    </div>
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
.policy-menu {
  --menu-active-bg: color-mix(in oklab, var(--color-base-content) 10%, transparent);
  --menu-active-fg: var(--color-base-content);
}

.runtime-switch {
  flex-direction: row-reverse;
  justify-content: space-between;
}

.runtime-fields .fieldset > :is(.input, .select, .textarea, .join) {
  width: 100%;
}
</style>
