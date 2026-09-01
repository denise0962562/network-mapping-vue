<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import http from '@/utils/http'

const namespaces = [
  { key: 'requests', title: '请求日志', description: '控制访问日志采集和在线保留期。' },
  { key: 'monitor', title: '健康监控', description: '控制慢请求、5xx、慢 SQL 与 Elasticsearch 告警阈值。' },
  { key: 'automatic_target', title: '自动目标', description: '控制系统自动生成的 IPv4/IPv6 扫描任务。' },
  { key: 'dns_follow_up', title: 'DNS 后续任务', description: '控制 DNS 解析结果自动创建端口扫描任务的范围。' },
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
  automatic_target: {
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
  analytics_snapshot: { mode: 'realtime', interval_minutes: 30 },
}

const alerts = ref([])
const activeTab = ref('requests')
const loading = reactive(Object.fromEntries(namespaces.map(({ key }) => [key, false])))
const saving = reactive(Object.fromEntries(namespaces.map(({ key }) => [key, false])))
const revisions = reactive(Object.fromEntries(namespaces.map(({ key }) => [key, 0])))
const settings = reactive(structuredClone(defaults))
const savedDocuments = reactive({})
const changeReasons = reactive(Object.fromEntries(namespaces.map(({ key }) => [key, ''])))
const cidrText = reactive({
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

function documentFor(namespace) {
  if (namespace === 'automatic_target') {
    return {
      ...settings.automatic_target,
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
  settings[namespace] = { ...clone(defaults[namespace]), ...clone(document) }
  revisions[namespace] = revision
  if (namespace === 'automatic_target') {
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
}

function isDirty(namespace) {
  return JSON.stringify(documentFor(namespace)) !== JSON.stringify(savedDocuments[namespace])
}

const hasUnsavedChanges = computed(() => namespaces.some(({ key }) => isDirty(key)))

function selectTab(namespace) {
  activeTab.value = namespace
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
  await Promise.all(namespaces.map(({ key }) => loadNamespace(key)))
}

async function saveNamespace(namespace) {
  if (saving[namespace] || !isDirty(namespace)) return true
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
      pushAlert('warning', '配置已被更新', '已有其他管理员发布了更新，已重新加载当前版本。')
      await loadNamespace(namespace, true)
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
    if (isDirty(key) && !(await saveNamespace(key))) return false
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

  <div class="p-5">
    <div class="mb-4">
      <h2 class="text-lg font-semibold">运行时配置</h2>
      <p class="text-xs opacity-60">这些策略保存在数据库中，保存后立即发布到当前服务进程。配置版本冲突时会重新加载，避免覆盖其他管理员的更新。</p>
    </div>

    <div class="tabs tabs-box mb-5 w-full overflow-x-auto" role="tablist" aria-label="运行时配置分类">
      <button v-for="item in namespaces" :key="item.key" type="button" role="tab" :aria-selected="activeTab === item.key" class="tab whitespace-nowrap" :class="{ 'tab-active': activeTab === item.key }" @click="selectTab(item.key)">
        {{ item.title }}
      </button>
    </div>

    <section v-for="item in namespaces" v-show="activeTab === item.key" :key="item.key" class="card card-border border-base-300 bg-base-100 p-4">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="font-semibold">{{ item.title }}</h3>
          <p class="mt-1 text-xs opacity-60">{{ item.description }}</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge badge-ghost badge-sm">版本 #{{ revisions[item.key] || '—' }}</span>
          <button type="button" class="btn btn-ghost btn-sm rounded-lg" :disabled="loading[item.key] || saving[item.key]" @click="loadNamespace(item.key)">重新加载</button>
          <button type="button" class="btn btn-neutral btn-sm rounded-lg" :class="isDirty(item.key) ? 'visible' : 'invisible'" :disabled="!isDirty(item.key) || loading[item.key] || saving[item.key]" @click="saveNamespace(item.key)">
            <span v-if="saving[item.key]" class="loading loading-spinner loading-xs"></span>{{ saving[item.key] ? '发布中' : '发布' }}
          </button>
        </div>
      </div>

      <div v-if="loading[item.key]" class="flex items-center gap-2 py-8 text-sm opacity-60"><span class="loading loading-spinner loading-sm"></span>正在读取配置...</div>

      <fieldset v-else :disabled="saving[item.key]" class="space-y-4">
        <template v-if="item.key === 'requests'">
          <div class="grid gap-4 md:grid-cols-2">
            <label class="rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer"><input v-model="settings.requests.enabled" type="checkbox" class="toggle mt-0.5" /><span><span class="block font-medium">采集请求日志</span><span class="mt-1 block text-xs opacity-60">关闭后停止写入新访问日志；后台 writer 保持待命。</span></span></label>
            <label class="form-control"><span class="label-text mb-1">在线保留天数</span><input v-model.number="settings.requests.retention_days" min="1" type="number" class="input input-bordered" /><span class="label-text-alt mt-1 opacity-60">保存后会按新版本重新安排清理。</span></label>
          </div>
        </template>

        <template v-else-if="item.key === 'monitor'">
          <div class="grid gap-4 lg:grid-cols-3">
            <label class="rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer"><input v-model="settings.monitor.enabled" type="checkbox" class="toggle mt-0.5" /><span><span class="block font-medium">启用健康监控</span><span class="mt-1 block text-xs opacity-60">关闭时不再发送健康告警。</span></span></label>
            <label class="rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer"><input v-model="settings.monitor.server_error_enabled" type="checkbox" class="toggle mt-0.5" /><span><span class="block font-medium">5xx 告警</span><span class="mt-1 block text-xs opacity-60">维护响应不会触发该告警。</span></span></label>
            <label class="form-control"><span class="label-text mb-1">告警冷却时间（秒）</span><input v-model.number="settings.monitor.alert_cooldown_seconds" min="1" type="number" class="input input-bordered" /></label>
            <label class="form-control"><span class="label-text mb-1">慢请求阈值（ms）</span><input v-model.number="settings.monitor.slow_request_threshold_ms" min="1" type="number" class="input input-bordered" /></label>
            <label class="form-control"><span class="label-text mb-1">慢 SQL 阈值（ms）</span><input v-model.number="settings.monitor.slow_sql_threshold_ms" min="1" type="number" class="input input-bordered" /></label>
            <label class="form-control"><span class="label-text mb-1">慢 SQL 检查间隔（秒）</span><input v-model.number="settings.monitor.slow_sql_check_interval_seconds" min="1" type="number" class="input input-bordered" /></label>
            <label class="form-control"><span class="label-text mb-1">ES 查询 warning（ms）</span><input v-model.number="settings.monitor.elasticsearch_query_warning_threshold_ms" min="1" type="number" class="input input-bordered" /></label>
            <label class="form-control"><span class="label-text mb-1">ES 查询 critical（ms）</span><input v-model.number="settings.monitor.elasticsearch_query_critical_threshold_ms" min="1" type="number" class="input input-bordered" /></label>
            <label class="form-control"><span class="label-text mb-1">ES 写入 warning（ms）</span><input v-model.number="settings.monitor.elasticsearch_write_warning_threshold_ms" min="1" type="number" class="input input-bordered" /></label>
            <label class="form-control"><span class="label-text mb-1">ES 写入 critical（ms）</span><input v-model.number="settings.monitor.elasticsearch_write_critical_threshold_ms" min="1" type="number" class="input input-bordered" /></label>
          </div>
        </template>

        <template v-else-if="item.key === 'automatic_target'">
          <div class="alert alert-warning alert-soft text-sm">自动目标会创建实际扫描任务。只允许填写已获得明确授权的网段；启用前请复核范围、端口和优先级。</div>
          <div class="grid gap-4 lg:grid-cols-3">
            <label class="rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer"><input v-model="settings.automatic_target.enabled" type="checkbox" class="toggle mt-0.5" /><span><span class="block font-medium">启用 IPv4 自动生成</span><span class="mt-1 block text-xs opacity-60">必须配置授权 IPv4 CIDR。</span></span></label>
            <label class="rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer"><input v-model="settings.automatic_target.ipv6_enabled" type="checkbox" class="toggle mt-0.5" /><span><span class="block font-medium">启用 IPv6 自动生成</span><span class="mt-1 block text-xs opacity-60">仅在支持 IPv6 的扫描器在线时补充。</span></span></label>
            <label class="form-control"><span class="label-text mb-1">生成间隔（秒）</span><input v-model.number="settings.automatic_target.interval_seconds" min="5" type="number" class="input input-bordered" /></label>
            <label class="form-control"><span class="label-text mb-1">IPv4 队列低水位 / 高水位</span><div class="join"><input v-model.number="settings.automatic_target.pending_low_watermark" min="0" max="100" type="number" class="input input-bordered join-item w-1/2" /><input v-model.number="settings.automatic_target.pending_high_watermark" min="1" max="100" type="number" class="input input-bordered join-item w-1/2" /></div></label>
            <label class="form-control"><span class="label-text mb-1">IPv6 队列低水位 / 高水位</span><div class="join"><input v-model.number="settings.automatic_target.ipv6_pending_low_watermark" min="0" max="100" type="number" class="input input-bordered join-item w-1/2" /><input v-model.number="settings.automatic_target.ipv6_pending_high_watermark" min="1" max="100" type="number" class="input input-bordered join-item w-1/2" /></div></label>
            <label class="form-control"><span class="label-text mb-1">优先级（0-4）</span><input v-model.number="settings.automatic_target.priority" min="0" max="4" type="number" class="input input-bordered" /></label>
            <label class="form-control"><span class="label-text mb-1">IPv4 任务前缀</span><input v-model.number="settings.automatic_target.ipv4_task_prefix" min="0" max="32" type="number" class="input input-bordered" /></label>
            <label class="form-control"><span class="label-text mb-1">IPv6 任务前缀</span><input v-model.number="settings.automatic_target.ipv6_task_prefix" min="0" max="128" type="number" class="input input-bordered" /></label>
            <label class="form-control"><span class="label-text mb-1">重复扫描间隔（秒）</span><input v-model.number="settings.automatic_target.repeat_after_seconds" min="1" type="number" class="input input-bordered" /></label>
          </div>
          <div class="grid gap-4 lg:grid-cols-2">
            <label class="form-control"><span class="label-text mb-1">授权 IPv4 CIDR</span><textarea v-model="cidrText.automaticAuthorized" class="textarea textarea-bordered min-h-28 font-mono text-sm" placeholder="198.51.100.0/24"></textarea></label>
            <label class="form-control"><span class="label-text mb-1">排除 IPv4 CIDR</span><textarea v-model="cidrText.automaticExcluded" class="textarea textarea-bordered min-h-28 font-mono text-sm" placeholder="198.51.100.128/25"></textarea></label>
            <label class="form-control"><span class="label-text mb-1">授权 IPv6 CIDR</span><textarea v-model="cidrText.automaticIpv6Authorized" class="textarea textarea-bordered min-h-28 font-mono text-sm" placeholder="2001:db8::/32"></textarea></label>
            <label class="form-control"><span class="label-text mb-1">排除 IPv6 CIDR</span><textarea v-model="cidrText.automaticIpv6Excluded" class="textarea textarea-bordered min-h-28 font-mono text-sm" placeholder="2001:db8:1::/48"></textarea></label>
          </div>
          <label class="form-control"><span class="label-text mb-1">常用端口</span><input v-model="settings.automatic_target.common_ports" type="text" class="input input-bordered font-mono" placeholder="80,443,8080" /><span class="label-text-alt mt-1 opacity-60">以逗号分隔，可使用范围，例如 8000-8100。</span></label>
        </template>

        <template v-else-if="item.key === 'dns_follow_up'">
          <div class="alert alert-warning alert-soft text-sm">此策略允许 DNS 解析结果创建端口扫描任务。必须将范围限制在已授权的 CIDR 内，排除项优先。</div>
          <div class="grid gap-4 lg:grid-cols-3">
            <label class="rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer"><input v-model="settings.dns_follow_up.enabled" type="checkbox" class="toggle mt-0.5" /><span><span class="block font-medium">启用 DNS 后续任务</span><span class="mt-1 block text-xs opacity-60">启用时必须配置授权 CIDR。</span></span></label>
            <label class="form-control"><span class="label-text mb-1">单任务最大目标数</span><input v-model.number="settings.dns_follow_up.max_targets_per_task" min="1" max="500" type="number" class="input input-bordered" /></label>
          </div>
          <div class="grid gap-4 lg:grid-cols-2"><label class="form-control"><span class="label-text mb-1">授权 CIDR</span><textarea v-model="cidrText.dnsAuthorized" class="textarea textarea-bordered min-h-28 font-mono text-sm"></textarea></label><label class="form-control"><span class="label-text mb-1">排除 CIDR</span><textarea v-model="cidrText.dnsExcluded" class="textarea textarea-bordered min-h-28 font-mono text-sm"></textarea></label></div>
        </template>

        <template v-else-if="item.key === 'analytics_snapshot'">
          <div class="grid gap-4 md:grid-cols-2"><label class="form-control"><span class="label-text mb-1">运行模式</span><select v-model="settings.analytics_snapshot.mode" class="select select-bordered"><option value="realtime">realtime（实时聚合）</option><option value="shadow">shadow（后台构建快照）</option><option value="snapshot">snapshot（读取快照）</option></select><span class="label-text-alt mt-1 opacity-60">切换为 snapshot 前请确认历史快照已构建完成。</span></label><label class="form-control"><span class="label-text mb-1">处理间隔（分钟）</span><input v-model.number="settings.analytics_snapshot.interval_minutes" min="1" max="1440" type="number" class="input input-bordered" /></label></div>
        </template>

        <label class="form-control"><span class="label-text mb-1">变更原因 <span class="opacity-60">（建议填写，最长 500 字）</span></span><input v-model="changeReasons[item.key]" maxlength="500" type="text" class="input input-bordered" placeholder="例如：调整告警阈值以适应新的性能基线" /></label>
      </fieldset>
    </section>
  </div>
</template>
