<script setup>
import { computed, onMounted, ref, watch, useId } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import http from '@/utils/http'
import { parseScanTargets, targetTypeLabel } from '@/utils/scanTargets'
import { nativeServices, supportsRequiredServices } from '@/utils/serviceDetection'
import { routingLocation, routingReason } from '@/utils/scanRouting'

const formFieldId = useId()
const LEGACY_DRAFT_KEY = 'createscan_draft'
const scanProfiles = [
  {
    value: 'vulnerability_scan',
    title: '全部',
    description: '依次发现端口、识别服务并使用审核过的 Nuclei 模板扫描漏洞。',
    domainDescription: '先查询并归档 DNS 记录，再对授权范围内的解析地址执行端口、服务和漏洞扫描。'
  },
  {
    value: 'port_only',
    title: '仅端口',
    description: '只发现开放端口，不启动服务识别或漏洞扫描。',
    domainDescription: '先解析域名，再对授权范围内的解析地址发现开放端口。'
  },
  {
    value: 'service_inventory',
    title: '服务识别',
    description: '发现开放端口并完成服务识别，不执行漏洞扫描。',
    domainDescription: '先解析域名，再对授权范围内的解析地址发现端口并识别服务。'
  },
  {
    value: 'dns_records',
    title: '仅 DNS',
    description: '只查询并归档 DNS 记录，不扫描解析地址。',
    domainOnly: true
  }
]

const targetInput = ref('')
const targetTouched = ref(false)
const port = ref('')
const level = ref(1)
const remark = ref('')
const alerts = ref([])
const submitting = ref(false)
const dispatchMode = ref('automatic')
const scannerIds = ref([])
const scanners = ref([])
const scannersLoading = ref(false)
const placement = ref(null)
const placementLoading = ref(false)
let placementRequest = 0
const requiredServices = ref([])
const scanProfile = ref('vulnerability_scan')
const dnsResolverMode = ref('system')
const dnsResolvers = ref([])
const dnsResolverPresets = ref([])
const selectedDnsResolverIds = ref([])
const defaultScanProfile = ref('vulnerability_scan')
const scanSettingsLoading = ref(true)
const targetValidation = computed(() => parseScanTargets(targetInput.value))
const targetType = computed(() => targetValidation.value.valid ? targetValidation.value.type : null)
const isDnsTask = computed(() => targetType.value === 'domain')
const targetValidationVisible = computed(() => targetTouched.value || targetInput.value.trim() !== '')
const targetSummary = computed(() => {
  const result = targetValidation.value
  if (!result.valid) return result.message
  const separator = {
    comma: '逗号分隔',
    newline: '换行分隔',
    single: '单个目标'
  }[result.separator]
  return `已识别 ${targetTypeLabel(result.type)}，共 ${result.targets.length} 个目标，${separator}`
})
const selectedScanProfile = computed(() => scanProfiles.find((profile) => profile.value === scanProfile.value))
const selectedScanProfileTitle = computed(() => selectedScanProfile.value?.title || '未选择')
const selectedScanProfileDescription = computed(() => (
  isDnsTask.value && selectedScanProfile.value?.domainDescription
    ? selectedScanProfile.value.domainDescription
    : selectedScanProfile.value?.description || ''
))
const scanRequiresPort = computed(() => scanProfile.value !== 'dns_records')
const selectedDnsResolvers = computed(() => {
  if (dnsResolverMode.value === 'preset') {
    const selected = new Set(selectedDnsResolverIds.value)
    return dnsResolverPresets.value.filter((resolver) => selected.has(resolver.id))
  }
  return dnsResolverMode.value === 'specified' ? dnsResolvers.value : []
})
const dispatchModeSummary = computed(() => {
  if (dispatchMode.value === 'selected') {
    return scannerIds.value.length > 0 ? `已指定 ${scannerIds.value.length} 台扫描器` : '指定扫描器'
  }
  if (dispatchMode.value === 'all') return '全部扫描器'
  return '自动分配'
})

const targetAddressFamily = computed(() => {
  if (targetType.value === 'ipv4') return 'ipv4'
  if (targetType.value === 'ipv6') return 'ipv6'
  if (targetType.value === 'domain') return 'ipv4'
  return null
})

function scannerSupportsProfile(scanner) {
  const requiredProfile = isDnsTask.value ? 'dns_records' : scanProfile.value
  if (requiredProfile === 'legacy') return true
  const profiles = scanner.scan_capabilities?.profiles
  return Array.isArray(profiles) && profiles.includes(requiredProfile)
}

function scannerSupportsTarget(scanner) {
  if (!scannerSupportsProfile(scanner) || !supportsRequiredServices(scanner, requiredServices.value)) return false
  if (isDnsTask.value
    && dnsResolverMode.value !== 'system'
    && scanner.scan_capabilities?.explicit_dns_resolvers !== true) return false
  if (isDnsTask.value
    && selectedDnsResolvers.value.some((resolver) => resolver.ip?.includes(':'))
    && !(scanner.supports_ipv6 === true && scanner.ipv6_ready === true)) return false
  if (targetAddressFamily.value === 'ipv6') {
    return scanner.supports_ipv6 === true && scanner.ipv6_ready === true
  }
  if (targetAddressFamily.value === 'ipv4') {
    return scanner.supports_ipv4 === true && scanner.ipv4_ready === true
  }
  return targetAddressFamily.value !== 'mixed'
}

watch([targetAddressFamily, scanProfile, dnsResolverMode, selectedDnsResolvers, requiredServices], () => {
  const compatibleIds = new Set(scanners.value.filter(scannerSupportsTarget).map((item) => item.scanner_id))
  scannerIds.value = scannerIds.value.filter((id) => compatibleIds.has(id))
})

watch(targetType, (value) => {
  if (value === 'domain') requiredServices.value = []
  if (value !== 'domain' && scanProfile.value === 'dns_records') {
    scanProfile.value = defaultScanProfile.value
  }
})

watch(scanProfile, (value) => {
  if (value === 'dns_records') port.value = ''
  if (!['service_inventory', 'vulnerability_scan'].includes(value)) requiredServices.value = []
})

const targetInputRef = ref(null)
const portInputRef = ref(null)
const hasUnsavedChanges = computed(() => (
  targetInput.value.trim() !== ''
  || port.value.trim() !== ''
  || level.value !== 1
  || remark.value.trim() !== ''
  || dispatchMode.value !== 'automatic'
  || scannerIds.value.length > 0
  || requiredServices.value.length > 0
  || scanProfile.value !== defaultScanProfile.value
  || dnsResolverMode.value !== 'system'
  || dnsResolvers.value.length > 0
  || selectedDnsResolverIds.value.length > 0
))

function addDnsResolver() {
  if (dnsResolvers.value.length >= 8) return
  const index = dnsResolvers.value.length + 1
  dnsResolvers.value.push({ id: `dns-${index}`, label: `DNS 服务器 ${index}`, ip: '', port: 53, transport: 'udp' })
}

function removeDnsResolver(index) {
  dnsResolvers.value.splice(index, 1)
}

function resetForm() {
  targetInput.value = ''
  targetTouched.value = false
  port.value = ''
  level.value = 1
  remark.value = ''
  dispatchMode.value = 'automatic'
  scannerIds.value = []
  requiredServices.value = []
  scanProfile.value = defaultScanProfile.value
  dnsResolverMode.value = 'system'
  dnsResolvers.value = []
  selectedDnsResolverIds.value = []
}

async function loadScanSettings() {
  try {
    const response = await http.get('/api/config/scan')
    const profile = response.data?.data?.defaultScanProfile
    if (scanProfiles.some((item) => item.value === profile && item.domainOnly !== true)) {
      defaultScanProfile.value = profile
      scanProfile.value = profile
    }
  } catch (error) {
    console.error('load scan settings failed', error)
    showAlert('warning', '默认扫描模式加载失败', '本次将使用“全部”模式。', 7000)
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

async function loadDnsResolverPresets() {
  try {
    const response = await http.get('/api/dns/resolvers')
    dnsResolverPresets.value = Array.isArray(response.data?.data) ? response.data.data : []
  } catch (error) {
    console.error('load DNS resolver presets failed', error)
    dnsResolverPresets.value = []
  }
}

onMounted(() => {
  localStorage.removeItem(LEGACY_DRAFT_KEY)
  loadScanners()
  loadScanSettings()
  loadDnsResolverPresets()
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

watch([targetInput, port, scanProfile, dnsResolverMode, selectedDnsResolvers, requiredServices], () => { placement.value = null; placementRequest++ })
async function previewPlacement() {
  const targets = targetValidation.value
  if (!targets.valid || targets.targets.length > 100) { showAlert('warning', '请先填写有效目标', '分配预览支持最多 100 个明确目标。'); return }
  const request = ++placementRequest
  placementLoading.value = true
  try {
    const response = await http.post('/api/task/placement-preview', {
      targets: targets.targets, scan_profile: isDnsTask.value ? 'dns_records' : scanProfile.value,
      port: port.value.trim() || (isDnsTask.value ? '53' : '1-65535'), required_services: requiredServices.value, dns_resolvers: isDnsTask.value ? selectedDnsResolvers.value : []
    })
    if (request === placementRequest) placement.value = response.data?.data || null
  } catch (error) { if (request === placementRequest) showAlert('warning', '分配预览暂不可用', error.response?.data?.message || '请稍后重试。') }
  finally { placementLoading.value = false }
}
async function submitTask() {
  if (submitting.value) return false
  if (scanSettingsLoading.value) return false
  targetTouched.value = true
  if (!targetInputRef.value?.reportValidity()) return false
  const validatedTargets = targetValidation.value
  if (!validatedTargets.valid) {
    showAlert('warning', '目标格式不正确', validatedTargets.message)
    return false
  }
  if (!isDnsTask.value && scanProfile.value === 'dns_records') {
    showAlert('warning', '仅 DNS 模式不可用', '仅 DNS 模式只能用于域名目标。')
    return false
  }
  if (scanRequiresPort.value && port.value && !portInputRef.value?.reportValidity()) return false
  if (dispatchMode.value === 'selected' && scannerIds.value.length === 0) {
    showAlert('warning', '请选择扫描器', '指定扫描器模式至少需要选择一台扫描器。')
    return false
  }

  try {
    submitting.value = true
    const submittingDnsTask = validatedTargets.type === 'domain'
    if (isDnsTask.value && dnsResolverMode.value !== 'system') {
      const taskResolvers = selectedDnsResolvers.value
      if (taskResolvers.length === 0) {
        showAlert('warning', '请添加 DNS 服务器', '指定 DNS 服务器模式至少需要添加一台服务器。')
        return false
      }
      if (taskResolvers.length > 8) {
        showAlert('warning', 'DNS 服务器过多', '单次任务最多可选择 8 台 DNS 服务器。')
        return false
      }
      const resolverIds = new Set()
      for (const resolver of taskResolvers) {
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
    const payload = submittingDnsTask
      ? {
          domains: validatedTargets.targets,
          level: Number(level.value),
          remark: remark.value.trim() ? remark.value.trim() : null,
          scan_profile: scanProfile.value,
          dispatch_mode: dispatchMode.value,
          scanner_ids: dispatchMode.value === 'selected' ? scannerIds.value : [],
          port: scanRequiresPort.value && port.value.trim() ? port.value.trim() : null,
          dns_resolvers: dnsResolverMode.value !== 'system'
            ? selectedDnsResolvers.value.map((item) => ({
                id: item.id.trim(), label: item.label.trim(), ip: item.ip.trim(),
                port: Number(item.port) || 53, transport: item.transport
              }))
            : []
        }
      : {
          required_services: requiredServices.value,
          ip: validatedTargets.targets.join(','),
          port: port.value.trim(),
          level: Number(level.value),
          remark: remark.value.trim() ? remark.value.trim() : null,
          dispatch_mode: dispatchMode.value,
          scanner_ids: dispatchMode.value === 'selected' ? scannerIds.value : [],
          scan_profile: scanProfile.value,
        }

    const response = await http.post(submittingDnsTask ? '/api/task/create-dns' : '/api/task/create', payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (response.status === 200) {
      resetForm()
      showAlert('success', submittingDnsTask ? '创建 DNS 任务成功' : '创建扫描任务成功', response.data?.data?.task_ids?.length > 1 ? `已按地域拆分为 ${response.data.data.task_ids.length} 个独立任务。` : '任务已提交到扫描队列。', 5000)
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

  <div class="page-shell">
    <h1 class="page-title mb-5">创建任务</h1>
    <div class="card bg-base-100 card-border border-base-300 w-full p-5">
      <div class="grid grid-cols-1 gap-4">
        <fieldset class="fieldset min-w-0 w-full">
          <legend class="fieldset-legend"><label for="create_task_targets" class="input_items_required">扫描目标</label></legend>
          <textarea
            id="create_task_targets"
            ref="targetInputRef"
            v-model="targetInput"
            class="textarea w-full min-h-32"
            :class="targetValidationVisible && !targetValidation.valid ? 'textarea-error' : ''"
            required
            spellcheck="false"
            placeholder="输入 IPv4/CIDR、IPv6/CIDR 或域名；多个目标使用逗号或换行分隔"
            :aria-invalid="targetValidationVisible && !targetValidation.valid"
            aria-describedby="create_task_targets_help"
            @blur="targetTouched = true"
          ></textarea>
          <span
            id="create_task_targets_help"
            class="label text-wrap text-xs"
            :class="targetValidationVisible && !targetValidation.valid ? 'text-error' : 'text-base-content/60'"
          >
            {{ targetValidationVisible
              ? targetSummary
              : '逗号和换行均可作为分隔符，但一次只能使用一种；域名至少包含一个点，标签限 63 字节、总长限 253 字节。' }}
          </span>
        </fieldset>

        <div class="space-y-3">
          <details name="create-task-options" class="create-task-accordion collapse collapse-arrow border border-base-300 bg-base-100" open>
            <summary class="collapse-title min-h-0 py-3 pr-12">
              <span class="block font-medium">扫描模式</span>
              <span class="mt-0.5 block text-xs text-base-content/60">
                {{ scanSettingsLoading ? '正在读取系统默认模式...' : `当前：${selectedScanProfileTitle}` }}
              </span>
            </summary>
            <div class="collapse-content">
              <fieldset class="pt-1" :disabled="scanSettingsLoading">
                <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <label
                    v-for="profile in scanProfiles"
                    :key="profile.value"
                    class="flex items-start gap-2 rounded-lg border border-transparent bg-base-200/50 p-3"
                    :class="[
                      scanProfile === profile.value ? 'border-base-content/60' : '',
                      profile.domainOnly && !isDnsTask ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'
                    ]"
                  >
                    <input
                      v-model="scanProfile"
                      class="radio radio-sm mt-0.5"
                      type="radio"
                      :value="profile.value"
                      :disabled="profile.domainOnly && !isDnsTask"
                    />
                    <span>
                      <span class="block font-medium">{{ profile.title }}</span>
                      <span class="mt-1 block text-xs leading-5 opacity-60">
                        {{ isDnsTask && profile.domainDescription ? profile.domainDescription : profile.description }}
                      </span>
                      <span v-if="profile.domainOnly && !isDnsTask" class="mt-1 block text-xs text-warning">仅域名目标可选</span>
                    </span>
                  </label>
                </div>
                <p class="mt-2 text-xs opacity-60">
                  {{ scanSettingsLoading ? '正在读取系统默认模式...' : selectedScanProfileDescription }}
                </p>
              </fieldset>
              <fieldset v-if="!isDnsTask && ['service_inventory', 'vulnerability_scan'].includes(scanProfile)" class="fieldset mt-3 rounded-lg bg-base-200/50 p-3">
                <legend class="fieldset-legend">定向服务探测（可选）</legend>
                <div class="flex flex-wrap gap-4">
                  <label v-for="service in nativeServices" :key="service.value" class="label cursor-pointer gap-2">
                    <input v-model="requiredServices" type="checkbox" class="checkbox checkbox-sm" :value="service.value" />{{ service.label }}
                  </label>
                </div>
                <p class="text-xs opacity-60">留空时使用默认识别策略。选中后对开放 TCP 端点仅尝试所选协议，支持非标准端口；仅分配给具备对应能力的节点。DNS TCP 服务探测与域名解析任务分别配置。</p>
              </fieldset>
              <div v-if="isDnsTask" class="mt-3 rounded-lg bg-base-200/50 p-3 text-sm">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p class="font-medium">解析服务器</p>
                    <p class="mt-1 text-xs text-base-content/60">指定多台服务器后，将对同一域名记录进行逐台对比。</p>
                  </div>
                  <select v-model="dnsResolverMode" class="select select-sm w-full sm:w-auto">
                    <option value="system">使用扫描器系统 DNS</option>
                    <option v-if="dnsResolverPresets.length" value="preset">选择常用 DNS 服务器</option>
                    <option value="specified">临时指定 DNS 服务器</option>
                  </select>
                </div>
                <div v-if="dnsResolverMode === 'preset'" class="mt-3 grid gap-2 sm:grid-cols-2">
                  <label v-for="resolver in dnsResolverPresets" :key="resolver.id" class="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 bg-base-100 px-3">
                    <input v-model="selectedDnsResolverIds" type="checkbox" class="checkbox checkbox-sm" :value="resolver.id" :disabled="!selectedDnsResolverIds.includes(resolver.id) && selectedDnsResolverIds.length >= 8" />
                    <span><span class="block font-medium">{{ resolver.label }}</span><span class="text-xs opacity-60">{{ resolver.ip }}:{{ resolver.port }}/{{ resolver.transport }}</span></span>
                  </label>
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
            </div>
          </details>

          <details name="create-task-options" class="create-task-accordion collapse collapse-arrow border border-base-300 bg-base-100">
            <summary class="collapse-title min-h-0 py-3 pr-12">
              <span class="block font-medium">执行扫描器</span>
              <span class="mt-0.5 block text-xs text-base-content/60">当前：{{ dispatchModeSummary }}</span>
            </summary>
            <div class="collapse-content">
              <fieldset class="pt-1">
                <p v-if="isDnsTask" class="mb-2 text-xs text-base-content/60">
                  所选扫描器执行域名 DNS 阶段；解析地址生成的 IP 子任务继续按地址族和扫描能力调度。
                </p>
                <div class="grid gap-2 md:grid-cols-3">
                  <label class="flex cursor-pointer items-start gap-2 rounded-lg bg-base-200/50 p-3">
                    <input v-model="dispatchMode" class="radio radio-sm mt-0.5" type="radio" value="automatic" />
                    <span><span class="block font-medium">自动分配</span><span class="text-xs opacity-60">按地域、能力和历史反馈分配</span></span>
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
                <div v-if="dispatchMode === 'automatic'" class="mt-3 space-y-2">
                  <button type="button" class="btn btn-outline btn-sm" :disabled="placementLoading || !targetValidation.valid" @click="previewPlacement"><span v-if="placementLoading" class="loading loading-spinner loading-xs"></span>预览扫描器分配</button>
                  <div v-if="placement" class="rounded-lg bg-base-200/50 p-3 text-sm">
                    <p>目标地域：{{ routingLocation(placement.target_geo) }}</p>
                    <p v-if="!placement.enabled" class="mt-1 opacity-70">智能分配已关闭，任务由兼容扫描器领取。</p>
                    <p v-else-if="!placement.preferred_scanner_id" class="mt-1 opacity-70">当前暂无空闲兼容节点，任务提交后排队等待。</p>
                    <div v-for="candidate in placement.candidates.slice(0, 5)" :key="candidate.scanner_id" class="mt-2 flex flex-wrap gap-2">
                      <span class="font-medium">{{ candidate.name }}</span><span v-if="candidate.scanner_id === placement.preferred_scanner_id && placement.enabled" class="badge badge-sm badge-success">推荐</span>
                      <span class="opacity-70">{{ routingLocation(candidate.geo) }} · {{ candidate.reasons.map(routingReason).join('、') }}</span>
                    </div>
                    <p class="mt-2 text-xs opacity-60">预览基于当前状态，实际领取时重新校验。</p>
                  </div>
                </div>
                <div v-if="dispatchMode === 'selected'" class="mt-3 rounded-lg border border-base-300 p-3">
                  <div v-if="scannersLoading" class="flex items-center gap-2 text-sm opacity-70"><span class="loading loading-spinner loading-xs"></span>加载扫描器...</div>
                  <div v-else-if="scanners.length === 0" class="text-sm opacity-70">暂无已启用扫描器</div>
                  <div v-else class="grid gap-2 md:grid-cols-2">
                    <label v-for="scanner in scanners" :key="scanner.scanner_id" class="flex items-center gap-3 rounded-lg bg-base-200/50 px-3 py-2" :class="scannerSupportsTarget(scanner) ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'">
                      <input v-model="scannerIds" class="checkbox checkbox-sm" type="checkbox" :value="scanner.scanner_id" :disabled="!scannerSupportsTarget(scanner)" />
                      <span class="min-w-0">
                        <span class="block truncate text-sm font-medium">{{ scanner.name || '未命名扫描器' }}</span>
                        <span class="block truncate text-xs opacity-60">{{ scanner.location || '未设置位置' }} · {{ scanner.is_online ? '在线' : '离线' }} · IPv4 {{ scanner.ipv4_ready ? '可用' : '不可用' }} / IPv6 {{ scanner.ipv6_ready ? '可用' : '不可用' }} · {{ scannerSupportsProfile(scanner) ? (isDnsTask ? '支持 DNS 阶段' : '支持当前模式') : (isDnsTask ? '不支持 DNS 阶段' : '不支持当前模式') }}</span>
                      </span>
                    </label>
                  </div>
                </div>
              </fieldset>
            </div>
          </details>

        </div>

        <fieldset v-if="scanRequiresPort" class="fieldset min-w-0 w-full">
          <legend class="fieldset-legend"><label for="create_task_port" class="input_items_required">{{ isDnsTask ? '解析 IP 的目标端口' : '目标端口' }}</label></legend>
          <input
            id="create_task_port"
            ref="portInputRef"
            v-model="port"
            class="task_input_items peer w-full"
            type="text"
            :placeholder="isDnsTask ? '请输入解析 IP 的目标端口，留空默认全端口' : '请输入目标端口，留空默认全端口'"
            pattern="^((6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3})(-(6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}))?)(,((6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3})(-(6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}))?))*$"
          />
          <div class="max-h-0 overflow-hidden opacity-0 transition-all duration-200 ease-in-out peer-[&:not(:placeholder-shown):invalid]:mt-1 peer-[&:not(:placeholder-shown):invalid]:max-h-10 peer-[&:not(:placeholder-shown):invalid]:opacity-100 text-error text-xs">
            请输入正确的端口
          </div>
        </fieldset>

        <fieldset class="fieldset min-w-0 w-full">
          <legend class="fieldset-legend"><label :for="`${formFieldId}-2`">优先级</label></legend>
          <select :id="`${formFieldId}-2`" v-model.number="level" class="select w-full">
            <option value="1">低级</option>
            <option value="0">最低（与系统自动生成扫描任务级别一致）</option>
            <option value="2">中级</option>
            <option value="3">高级</option>
            <option value="4">紧急</option>
          </select>
        </fieldset>

        <fieldset class="fieldset min-w-0 w-full">
          <legend class="fieldset-legend"><label for="create_task_remark" class="text-base-content/60">备注</label></legend>
          <textarea
            id="create_task_remark"
            v-model="remark"
            class="textarea w-full"
            placeholder="备注，最长不超过 200 个字符"
            maxlength="200"
          ></textarea>
        </fieldset>
      </div>

      <div class="flex justify-end mt-3">
        <button id="task_submit" class="btn rounded-lg btn-neutral w-full md:w-auto" :disabled="submitting || scanSettingsLoading" @click="submitTask">
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

</style>
