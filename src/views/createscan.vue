<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import http from '@/utils/http'

const LEGACY_DRAFT_KEY = 'createscan_draft'
const scanProfiles = [
  { value: 'legacy', title: '兼容模式', description: '端口发现后尝试识别服务，识别失败仍保留端口结果。' },
  { value: 'port_only', title: '仅端口扫描', description: '只发现开放端口，不启动服务识别。' },
  { value: 'service_inventory', title: '服务识别', description: '必须完成服务识别，识别失败会使任务失败。' }
]
const dnsScanProfiles = [
  { value: 'dns_records', title: '仅 DNS 记录', description: '仅查询并归档 DNS 记录。' },
  { value: 'dns_full', title: '全部', description: 'DNS 记录 + 解析 IP 的端口扫描；漏洞扫描后续加入。' },
  { value: 'dns_ports', title: '端口', description: '仅扫描 DNS 解析出的 IP 端口。' }
]

const targetType = ref('ip')
const ip = ref('')
const domains = ref('')
const port = ref('')
const level = ref(1)
const remark = ref('')
const alerts = ref([])
const submitting = ref(false)
const dispatchMode = ref('automatic')
const scannerIds = ref([])
const scanners = ref([])
const scannersLoading = ref(false)
const scanProfile = ref('legacy')
const dnsScanProfile = ref('dns_full')
const dnsFollowUpPortScan = ref(false)
const dnsFollowUpScanProfile = ref('port_only')
const dnsResolverMode = ref('system')
const dnsResolvers = ref([])
const defaultScanProfile = ref('legacy')
const scanSettingsLoading = ref(true)
const selectedScanProfileTitle = computed(() => (
  targetType.value === 'dns'
    ? 'DNS 记录查询'
    : scanProfiles.find((profile) => profile.value === scanProfile.value)?.title || '未选择'
))
const isDnsTask = computed(() => targetType.value === 'dns')
const dnsIncludesPortScan = computed(() => dnsScanProfile.value !== 'dns_records')
const dnsRequiresPort = computed(() => dnsIncludesPortScan.value || dnsFollowUpPortScan.value)
const dispatchModeSummary = computed(() => {
  if (dispatchMode.value === 'selected') {
    return scannerIds.value.length > 0 ? `已指定 ${scannerIds.value.length} 台扫描器` : '指定扫描器'
  }
  if (dispatchMode.value === 'all') return '全部扫描器'
  return '自动分配'
})

const targetAddressFamily = computed(() => {
  if (isDnsTask.value) return 'ipv4'
  const targets = ip.value.split(',').map((item) => item.trim()).filter(Boolean)
  if (targets.length === 0) return null
  const hasIpv4 = targets.some((target) => !target.includes(':'))
  const hasIpv6 = targets.some((target) => target.includes(':'))
  if (hasIpv4 && hasIpv6) return 'mixed'
  return hasIpv6 ? 'ipv6' : 'ipv4'
})

function scannerSupportsProfile(scanner) {
  if (scanProfile.value === 'legacy') return true
  const profiles = scanner.scan_capabilities?.profiles
  return Array.isArray(profiles) && profiles.includes(scanProfile.value)
}

function scannerSupportsTarget(scanner) {
  if (!scannerSupportsProfile(scanner)) return false
  if (targetAddressFamily.value === 'ipv6') {
    return scanner.supports_ipv6 === true && scanner.ipv6_ready === true
  }
  if (targetAddressFamily.value === 'ipv4') {
    return scanner.supports_ipv4 === true && scanner.ipv4_ready === true
  }
  return targetAddressFamily.value !== 'mixed'
}

watch([targetAddressFamily, scanProfile, targetType], () => {
  const compatibleIds = new Set(scanners.value.filter(scannerSupportsTarget).map((item) => item.scanner_id))
  scannerIds.value = scannerIds.value.filter((id) => compatibleIds.has(id))
})

watch(targetType, (value) => {
  if (value !== 'dns') return
  dispatchMode.value = 'automatic'
  scannerIds.value = []
})

const ipInputRef = ref(null)
const domainsInputRef = ref(null)
const portInputRef = ref(null)
const hasUnsavedChanges = computed(() => (
  ip.value.trim() !== ''
  || domains.value.trim() !== ''
  || targetType.value !== 'ip'
  || port.value.trim() !== ''
  || level.value !== 1
  || remark.value.trim() !== ''
  || dispatchMode.value !== 'automatic'
  || scannerIds.value.length > 0
  || scanProfile.value !== defaultScanProfile.value
  || dnsScanProfile.value !== 'dns_full'
  || dnsFollowUpPortScan.value
  || dnsFollowUpScanProfile.value !== 'port_only'
  || dnsResolverMode.value !== 'system'
  || dnsResolvers.value.length > 0
))

function addDnsResolver() {
  if (dnsResolvers.value.length >= 8) return
  const index = dnsResolvers.value.length + 1
  dnsResolvers.value.push({ id: `dns-${index}`, label: `DNS 服务器 ${index}`, ip: '', port: 53, transport: 'udp' })
}

function removeDnsResolver(index) {
  dnsResolvers.value.splice(index, 1)
}

function setDnsFollowUpPortScan(event) {
  dnsFollowUpPortScan.value = event.target.checked
  if (dnsFollowUpPortScan.value) dnsScanProfile.value = 'dns_records'
}

function resetForm() {
  ip.value = ''
  domains.value = ''
  targetType.value = 'ip'
  port.value = ''
  level.value = 1
  remark.value = ''
  dispatchMode.value = 'automatic'
  scannerIds.value = []
  scanProfile.value = defaultScanProfile.value
  dnsScanProfile.value = 'dns_full'
  dnsFollowUpPortScan.value = false
  dnsFollowUpScanProfile.value = 'port_only'
  dnsResolverMode.value = 'system'
  dnsResolvers.value = []
}

async function loadScanSettings() {
  try {
    const response = await http.get('/api/config/scan')
    const profile = response.data?.data?.defaultScanProfile
    if (scanProfiles.some((item) => item.value === profile)) {
      defaultScanProfile.value = profile
      scanProfile.value = profile
    }
  } catch (error) {
    console.error('load scan settings failed', error)
    showAlert('warning', '默认扫描模式加载失败', '本次将使用兼容模式。', 7000)
  } finally {
    scanSettingsLoading.value = false
  }
}

async function loadScanners() {
  scannersLoading.value = true
  try {
    const response = await http.get('/api/scanner/list')
    const data = response.data?.data
    if (!Array.isArray(data)) throw new Error('invalid scanner list')
    scanners.value = data.filter((item) => item.is_enable === true)
    const validIds = new Set(scanners.value.map((item) => item.scanner_id))
    scannerIds.value = scannerIds.value.filter((id) => validIds.has(id))
  } catch (error) {
    console.error('load scanners failed', error)
    showAlert('error', '扫描器列表加载失败', '指定扫描器暂不可用，请稍后刷新。', 7000)
  } finally {
    scannersLoading.value = false
  }
}

onMounted(() => {
  localStorage.removeItem(LEGACY_DRAFT_KEY)
  loadScanners()
  loadScanSettings()
})

function closeAlertById(id) {
  alerts.value = alerts.value.filter((alert) => alert.id !== id)
}

function showAlert(type, title, description = '', timeout = 5000) {
  alerts.value.unshift({
    id: crypto.randomUUID(),
    type,
    title,
    description,
    timeout
  })
}

async function submitTask() {
  if (submitting.value) return false
  if (!isDnsTask.value && scanSettingsLoading.value) return false
  if (isDnsTask.value) {
    if (!domainsInputRef.value?.reportValidity()) return false
  } else if (!ipInputRef.value?.reportValidity()) return false
  if ((!isDnsTask.value || dnsRequiresPort.value) && port.value && !portInputRef.value?.reportValidity()) return false
  if (targetAddressFamily.value === 'mixed') {
    showAlert('warning', '不能混合地址协议', '请将 IPv4 和 IPv6 目标拆分为两个扫描任务。')
    return false
  }
  if (!isDnsTask.value && dispatchMode.value === 'selected' && scannerIds.value.length === 0) {
    showAlert('warning', '请选择扫描器', '指定扫描器模式至少需要选择一台扫描器。')
    return false
  }

  try {
    submitting.value = true

    const dnsTargets = domains.value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)
    if (isDnsTask.value && (dnsTargets.length === 0 || dnsTargets.length > 500)) {
      showAlert('warning', '请输入有效域名', '一次 DNS 任务最多可包含 500 个域名。')
      return false
    }
    if (isDnsTask.value && dnsResolverMode.value === 'specified') {
      if (dnsResolvers.value.length === 0) {
        showAlert('warning', '请添加 DNS 服务器', '指定 DNS 服务器模式至少需要添加一台服务器。')
        return false
      }
      const resolverIds = new Set()
      for (const resolver of dnsResolvers.value) {
        const id = resolver.id.trim()
        const ip = resolver.ip.trim()
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !resolver.label.trim() || !ip || !['udp', 'tcp'].includes(resolver.transport)) {
          showAlert('warning', 'DNS 服务器配置无效', '请填写 ID、名称、IP 地址和 UDP 或 TCP 传输协议。')
          return false
        }
        if (resolverIds.has(id.toLowerCase())) {
          showAlert('warning', 'DNS 服务器 ID 重复', '每台 DNS 服务器需要唯一 ID。')
          return false
        }
        resolverIds.add(id.toLowerCase())
      }
    }
    const payload = isDnsTask.value
      ? {
          domains: dnsTargets,
          level: Number(level.value),
          remark: remark.value.trim() ? remark.value.trim() : null,
          scan_profile: dnsScanProfile.value,
          port: dnsRequiresPort.value ? port.value.trim() : null,
          follow_up_port_scan: dnsFollowUpPortScan.value,
          follow_up_scan_profile: dnsFollowUpScanProfile.value,
          dns_resolvers: dnsResolverMode.value === 'specified'
            ? dnsResolvers.value.map((item) => ({
                id: item.id.trim(), label: item.label.trim(), ip: item.ip.trim(),
                port: Number(item.port) || 53, transport: item.transport
              }))
            : []
        }
      : {
          ip: ip.value.trim(),
          port: port.value.trim(),
          level: Number(level.value),
          remark: remark.value.trim() ? remark.value.trim() : null,
          dispatch_mode: dispatchMode.value,
          scanner_ids: dispatchMode.value === 'selected' ? scannerIds.value : [],
          scan_profile: scanProfile.value,
        }

    const response = await http.post(isDnsTask.value ? '/api/task/create-dns' : '/api/task/create', payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (response.status === 200) {
      resetForm()
      showAlert('success', isDnsTask.value ? '创建 DNS 任务成功' : '创建扫描任务成功', '任务已提交到扫描队列。', 5000)
      return true
    } else {
      showAlert('error', '创建扫描失败', '服务器未接受本次创建请求。', 7000)
      return false
    }
  } catch (error) {
    console.error('create scan task failed', error)
    const message = error?.response?.data?.message
    showAlert(
      'error',
      '创建扫描失败',
      typeof message === 'string' && message.trim()
        ? message
        : '请检查网络连接或服务器运行状态。',
      7000
    )
    return false
  } finally {
    submitting.value = false
  }
}

useUnsavedChanges(hasUnsavedChanges, submitTask)
</script>

<template>
  <div class="pointer-events-none fixed right-4 top-20 z-50 flex w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:w-auto">
    <AppAlert
      v-for="alert in alerts"
      :key="alert.id"
      class="pointer-events-auto"
      :type="alert.type"
      :title="alert.title"
      :description="alert.description"
      :timeout="alert.timeout"
      @close="closeAlertById(alert.id)"
    />
  </div>

  <div class="flex justify-center">
    <div class="card bg-base-100 card-border m-2.5 border-base-300 w-[85%] p-5">
      <div class="grid grid-cols-1 gap-4">
        <div role="tablist" class="tabs tabs-box w-fit" aria-label="任务类型">
          <button
            type="button"
            role="tab"
            class="tab task-type-tab"
            :class="{ 'tab-active': !isDnsTask }"
            :aria-selected="!isDnsTask"
            @click="targetType = 'ip'"
          >
            IP / CIDR
          </button>
          <button
            type="button"
            role="tab"
            class="tab task-type-tab"
            :class="{ 'tab-active': isDnsTask }"
            :aria-selected="isDnsTask"
            @click="targetType = 'dns'"
          >
            域名
          </button>
        </div>

        <label v-if="!isDnsTask" class="form-control w-full">
          <span class="label-text input_items_required">目标 IP</span>
          <input
            id="create_task_ip"
            ref="ipInputRef"
            v-model="ip"
            class="task_input_items peer"
            type="text"
            required
            placeholder="请输入目标 IP 或 CIDR，多个目标请使用 , 隔开"
            pattern="^[0-9A-Fa-f:.,/]+$"
          />
          <div class="max-h-0 overflow-hidden opacity-0 transition-all duration-200 ease-in-out peer-[&:not(:placeholder-shown):invalid]:mt-1 peer-[&:not(:placeholder-shown):invalid]:max-h-10 peer-[&:not(:placeholder-shown):invalid]:opacity-100 text-error text-xs">
            请输入正确的目标地址
          </div>
        </label>

        <label v-else class="form-control w-full">
          <span class="label-text input_items_required">目标域名</span>
          <textarea
            id="create_task_domains"
            ref="domainsInputRef"
            v-model="domains"
            class="textarea w-full min-h-32"
            required
            placeholder="每行一个域名，也可使用英文逗号分隔"
          ></textarea>
          <span class="label-text-alt mt-1 text-base-content/60">最多 500 个域名；仅查询已获得授权的资产。</span>
        </label>

        <div class="space-y-3">
          <details name="create-task-options" class="create-task-accordion collapse collapse-arrow border border-base-300 bg-base-100" open>
            <summary class="collapse-title min-h-0 py-3 pr-12">
              <span class="block font-medium">扫描模式</span>
              <span class="mt-0.5 block text-xs text-base-content/60">
                {{ scanSettingsLoading ? '正在读取系统默认模式...' : `当前：${selectedScanProfileTitle}` }}
              </span>
            </summary>
            <div class="collapse-content">
              <fieldset v-if="!isDnsTask" class="pt-1" :disabled="scanSettingsLoading">
                <div class="grid gap-2 md:grid-cols-3">
                  <label
                    v-for="profile in scanProfiles"
                    :key="profile.value"
                    class="flex cursor-pointer items-start gap-2 rounded-lg border border-transparent bg-base-200/50 p-3"
                    :class="scanProfile === profile.value ? 'border-neutral' : ''"
                  >
                    <input v-model="scanProfile" class="radio radio-sm mt-0.5" type="radio" :value="profile.value" />
                    <span>
                      <span class="block font-medium">{{ profile.title }}</span>
                      <span class="mt-1 block text-xs leading-5 opacity-60">{{ profile.description }}</span>
                    </span>
                  </label>
                </div>
                <p class="mt-2 text-xs opacity-60">{{ scanSettingsLoading ? '正在读取系统默认模式...' : '默认值来自系统扫描设置，可为当前任务单独调整。' }}</p>
              </fieldset>
              <div v-else class="rounded-lg bg-base-200/50 p-3 text-sm">
                <div role="tablist" class="tabs tabs-box w-fit" aria-label="域名扫描模式">
                  <button
                    v-for="profile in dnsScanProfiles"
                    :key="profile.value"
                    type="button"
                    role="tab"
                    class="tab task-type-tab"
                    :class="{ 'tab-active': dnsScanProfile === profile.value }"
                    :aria-selected="dnsScanProfile === profile.value"
                    @click="dnsScanProfile = profile.value"
                  >
                    {{ profile.title }}
                  </button>
                </div>
                <p class="mt-3 text-xs leading-5 text-base-content/60">
                  {{ dnsScanProfiles.find((profile) => profile.value === dnsScanProfile)?.description }}
                </p>
              </div>
              <div v-if="isDnsTask" class="mt-3 rounded-lg bg-base-200/50 p-3 text-sm">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p class="font-medium">解析服务器</p>
                    <p class="mt-1 text-xs text-base-content/60">指定多台服务器后，将对同一域名记录进行逐台对比。</p>
                  </div>
                  <select v-model="dnsResolverMode" class="select select-sm w-full sm:w-auto">
                    <option value="system">使用扫描器系统 DNS</option>
                    <option value="specified">指定 DNS 服务器</option>
                  </select>
                </div>
                <div v-if="dnsResolverMode === 'specified'" class="mt-3 space-y-2">
                  <div v-for="(resolver, index) in dnsResolvers" :key="index" class="grid gap-2 rounded-lg border border-base-300 bg-base-100 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_6rem_6rem_auto]">
                    <input v-model="resolver.id" class="input input-sm w-full" maxlength="64" placeholder="ID，如 dns-1" />
                    <input v-model="resolver.label" class="input input-sm w-full" maxlength="128" placeholder="名称" />
                    <input v-model="resolver.ip" class="input input-sm w-full" placeholder="IP 地址" />
                    <input v-model.number="resolver.port" class="input input-sm w-full" type="number" min="1" max="65535" aria-label="DNS 端口" />
                    <select v-model="resolver.transport" class="select select-sm w-full" aria-label="DNS 传输协议"><option value="udp">UDP</option><option value="tcp">TCP</option></select>
                    <button type="button" class="btn btn-ghost btn-sm text-error" @click="removeDnsResolver(index)">删除</button>
                  </div>
                  <button type="button" class="btn btn-outline btn-sm" :disabled="dnsResolvers.length >= 8" @click="addDnsResolver">添加 DNS 服务器</button>
                </div>
              </div>
              <div v-if="isDnsTask" class="mt-3 rounded-lg bg-base-200/50 p-3 text-sm">
                <label class="flex cursor-pointer items-start gap-3">
                  <input
                    class="toggle toggle-sm mt-0.5"
                    type="checkbox"
                    :checked="dnsFollowUpPortScan"
                    @change="setDnsFollowUpPortScan"
                  />
                  <span>
                    <span class="block font-medium">解析后创建独立端口扫描任务</span>
                    <span class="mt-1 block text-xs leading-5 text-base-content/60">DNS 主任务完成后，服务端会仅对授权网段内的 A / AAAA 地址创建可独立追踪的端口任务。</span>
                  </span>
                </label>
                <label v-if="dnsFollowUpPortScan" class="form-control mt-3 max-w-sm">
                  <span class="label-text text-xs">派生任务扫描模式</span>
                  <select v-model="dnsFollowUpScanProfile" class="select select-sm w-full">
                    <option value="port_only">仅端口扫描</option>
                    <option value="service_inventory">服务识别</option>
                    <option value="legacy">兼容模式</option>
                  </select>
                </label>
              </div>
            </div>
          </details>

          <details v-if="!isDnsTask" name="create-task-options" class="create-task-accordion collapse collapse-arrow border border-base-300 bg-base-100">
            <summary class="collapse-title min-h-0 py-3 pr-12">
              <span class="block font-medium">执行扫描器</span>
              <span class="mt-0.5 block text-xs text-base-content/60">当前：{{ dispatchModeSummary }}</span>
            </summary>
            <div class="collapse-content">
              <fieldset class="pt-1">
                <div class="grid gap-2 md:grid-cols-3">
                  <label class="flex cursor-pointer items-start gap-2 rounded-lg bg-base-200/50 p-3">
                    <input v-model="dispatchMode" class="radio radio-sm mt-0.5" type="radio" value="automatic" />
                    <span><span class="block font-medium">自动分配</span><span class="text-xs opacity-60">任意可用扫描器执行一次</span></span>
                  </label>
                  <label class="flex cursor-pointer items-start gap-2 rounded-lg bg-base-200/50 p-3">
                    <input v-model="dispatchMode" class="radio radio-sm mt-0.5" type="radio" value="selected" />
                    <span><span class="block font-medium">指定扫描器</span><span class="text-xs opacity-60">选择一台或多台分别执行</span></span>
                  </label>
                  <label class="flex cursor-pointer items-start gap-2 rounded-lg bg-base-200/50 p-3">
                    <input v-model="dispatchMode" class="radio radio-sm mt-0.5" type="radio" value="all" />
                    <span><span class="block font-medium">全部扫描器</span><span class="text-xs opacity-60">所有已启用扫描器各执行一次，离线设备上线后执行</span></span>
                  </label>
                </div>
                <div v-if="dispatchMode === 'selected'" class="mt-3 rounded-lg border border-base-300 p-3">
                  <div v-if="scannersLoading" class="flex items-center gap-2 text-sm opacity-70"><span class="loading loading-spinner loading-xs"></span>加载扫描器...</div>
                  <div v-else-if="scanners.length === 0" class="text-sm opacity-70">暂无已启用扫描器</div>
                  <div v-else class="grid gap-2 md:grid-cols-2">
                    <label v-for="scanner in scanners" :key="scanner.scanner_id" class="flex items-center gap-3 rounded-lg bg-base-200/50 px-3 py-2" :class="scannerSupportsTarget(scanner) ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'">
                      <input v-model="scannerIds" class="checkbox checkbox-sm" type="checkbox" :value="scanner.scanner_id" :disabled="!scannerSupportsTarget(scanner)" />
                      <span class="min-w-0">
                        <span class="block truncate text-sm font-medium">{{ scanner.name || '未命名扫描器' }}</span>
                        <span class="block truncate text-xs opacity-60">{{ scanner.location || '未设置位置' }} · {{ scanner.is_online ? '在线' : '离线' }} · IPv4 {{ scanner.ipv4_ready ? '可用' : '不可用' }} / IPv6 {{ scanner.ipv6_ready ? '可用' : '不可用' }} · {{ scannerSupportsProfile(scanner) ? '支持当前模式' : '不支持当前模式' }}</span>
                      </span>
                    </label>
                  </div>
                </div>
              </fieldset>
            </div>
          </details>

          <div v-else class="rounded-lg border border-base-300 bg-base-100 p-3 text-sm">
            <p class="font-medium">执行方式：自动分配</p>
            <p class="mt-1 text-xs text-base-content/60">DNS 任务由支持 DNS 查询阶段的可用扫描器自动领取。</p>
          </div>
        </div>

        <label v-if="!isDnsTask || dnsRequiresPort" class="form-control w-full">
          <span class="label-text input_items_required">{{ isDnsTask ? '解析 IP 的目标端口' : '目标端口' }}</span>
          <input
            id="create_task_port"
            ref="portInputRef"
            v-model="port"
            class="task_input_items peer"
            type="text"
            :placeholder="isDnsTask ? '请输入解析 IP 的目标端口，留空默认全端口' : '请输入目标端口，留空默认全端口'"
            pattern="^((6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3})(-(6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}))?)(,((6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3})(-(6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}))?))*$"
          />
          <div class="max-h-0 overflow-hidden opacity-0 transition-all duration-200 ease-in-out peer-[&:not(:placeholder-shown):invalid]:mt-1 peer-[&:not(:placeholder-shown):invalid]:max-h-10 peer-[&:not(:placeholder-shown):invalid]:opacity-100 text-error text-xs">
            请输入正确的端口
          </div>
        </label>

        <label class="form-control w-full">
          <span class="label-text mb-1">优先级</span>
          <select v-model.number="level" class="select w-full">
            <option value="1">低级</option>
            <option value="0">最低（与系统自动生成扫描任务级别一致）</option>
            <option value="2">中级</option>
            <option value="3">高级</option>
            <option value="4">紧急</option>
          </select>
        </label>

        <label class="form-control w-full">
          <span class="label-text mb-1 text-base-content/60">备注</span>
          <textarea
            id="create_task_remark"
            v-model="remark"
            class="textarea w-full"
            placeholder="备注，最长不超过 200 个字符"
            maxlength="200"
          ></textarea>
        </label>
      </div>

      <div class="flex justify-end mt-3">
        <button id="task_submit" class="btn rounded-lg btn-neutral w-full md:w-auto" :disabled="submitting || (!isDnsTask && scanSettingsLoading)" @click="submitTask">
          {{ submitting ? '提交中...' : '提交' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task_input_items,
.textarea,
.select {
  text-align: left;
}

.task_input_items::placeholder,
.textarea::placeholder {
  text-align: left;
}

.create-task-accordion {
  transition:
    border-color 200ms ease,
    box-shadow 200ms ease;
}

.create-task-accordion[open] {
  border-color: color-mix(in oklab, var(--color-neutral) 35%, var(--color-base-300));
  box-shadow: 0 1px 3px color-mix(in oklab, var(--color-base-content) 8%, transparent);
}

.create-task-accordion > summary {
  transition: background-color 200ms ease;
}

.create-task-accordion > summary:hover {
  background-color: color-mix(in oklab, var(--color-base-content) 5%, transparent);
}

.task-type-tab {
  transition:
    color 180ms ease,
    background-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.task-type-tab.tab-active {
  transform: translateY(-1px);
}

@media (prefers-reduced-motion: reduce) {
  .task-type-tab {
    transition: none;
  }
}
</style>
