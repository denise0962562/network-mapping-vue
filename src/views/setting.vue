<script setup>
import { computed, onMounted, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import http from '@/utils/http'

const alerts = ref([])

const listenConfig = ref({
  host: '0.0.0.0',
  port: '8080'
})

const securityConfig = ref({
  maxLoginRetries: 3,
  lockMinutes: 30,
  apiRateLimit: 50,
  pageRateLimit: 50
})

const sessionSettings = ref({
  sessionTtlMinutes: 45,
  invalidateOtherSessions: false
})
const sessionLimits = ref({ minimumMinutes: 5, maximumMinutes: 1440 })

const BUILT_IN_CLIENT_IP_HEADERS = ['x-forwarded-for', 'forwarded']
const HTTP_HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_\x60|~0-9A-Za-z]+$/
const trustedProxySettings = ref({
  trustedProxyCidrsText: '',
  clientIpHeaderMode: 'x-forwarded-for',
  customClientIpHeader: ''
})
const trustedProxyLimits = ref({
  maximumCidrs: 32,
  maximumHeaderNameLength: 64,
  supportsCustomHeader: false
})

const mailConfig = ref({
  testRecipient: '',
  smtpHost: '',
  smtpPort: 465,
  sender: '',
  senderKey: ''
})

const notificationPrefs = ref({
  loginNotifyEnabled: true,
  notifyOnStuck: true,
  notifyOnComplete: true,
  reportDaily: false,
  reportWeekly: true,
  reportMonthly: false,
  healthAlertEnabled: true
})

const savedListenConfig = ref({ ...listenConfig.value })
const savedSecurityConfig = ref({ ...securityConfig.value })
const savedSessionSettings = ref({ sessionTtlMinutes: sessionSettings.value.sessionTtlMinutes })
const savedTrustedProxySettings = ref({ ...trustedProxySettings.value })
const savedMailConfig = ref({ ...mailConfig.value })
const savedNotificationPrefs = ref({ ...notificationPrefs.value })
const showSenderKey = ref(false)
const senderKeyConfigured = ref(false)
const loadingMailConfig = ref(false)
const savingNotifyConfig = ref(false)
const testingMailServer = ref(false)
const loadingSessionSettings = ref(false)
const savingSessionSettings = ref(false)
const loadingTrustedProxySettings = ref(false)
const savingTrustedProxySettings = ref(false)

function pushAlert(type, title, description = '', timeout = 7000) {
  alerts.value.unshift({
    id: crypto.randomUUID(),
    type,
    title,
    description,
    timeout
  })
}

function closeAlert(id) {
  alerts.value = alerts.value.filter((alert) => alert.id !== id)
}

const showListenSave = computed(
  () => JSON.stringify(listenConfig.value) !== JSON.stringify(savedListenConfig.value)
)
const showSecuritySave = computed(
  () => JSON.stringify(securityConfig.value) !== JSON.stringify(savedSecurityConfig.value)
)
const showSessionSave = computed(() => (
  sessionSettings.value.sessionTtlMinutes !== savedSessionSettings.value.sessionTtlMinutes
  || sessionSettings.value.invalidateOtherSessions
))
function resolvedClientIpHeader(settings) {
  return settings.clientIpHeaderMode === 'custom'
    ? settings.customClientIpHeader.trim().toLowerCase()
    : settings.clientIpHeaderMode
}

function comparableTrustedProxySettings(settings) {
  return {
    trustedProxyCidrsText: settings.trustedProxyCidrsText,
    clientIpHeader: resolvedClientIpHeader(settings)
  }
}

const showTrustedProxySave = computed(() => (
  JSON.stringify(comparableTrustedProxySettings(trustedProxySettings.value))
    !== JSON.stringify(comparableTrustedProxySettings(savedTrustedProxySettings.value))
))
const trustedProxyCidrs = computed(() => trustedProxySettings.value.trustedProxyCidrsText
  .split(/[\n,]+/)
  .map((value) => value.trim())
  .filter(Boolean))
const customClientIpHeaderError = computed(() => {
  if (trustedProxySettings.value.clientIpHeaderMode !== 'custom') return ''
  const value = trustedProxySettings.value.customClientIpHeader.trim()
  if (!value) return '请输入自定义请求头名称。'
  if (value.length > trustedProxyLimits.value.maximumHeaderNameLength) {
    return `请求头名称不能超过 ${trustedProxyLimits.value.maximumHeaderNameLength} 个字符。`
  }
  if (!HTTP_HEADER_NAME_PATTERN.test(value)) {
    return '请求头名称包含空格、冒号或其他非法字符。'
  }
  return ''
})
const showNotifySave = computed(() => {
  const mailChanged = JSON.stringify(mailConfig.value) !== JSON.stringify(savedMailConfig.value)
  const prefChanged = JSON.stringify(notificationPrefs.value) !== JSON.stringify(savedNotificationPrefs.value)
  return mailChanged || prefChanged
})
const hasUnsavedChanges = computed(() => (
  showListenSave.value
  || showSecuritySave.value
  || showSessionSave.value
  || showTrustedProxySave.value
  || showNotifySave.value
))

function clampLoginRetries() {
  let value = Number(securityConfig.value.maxLoginRetries)
  if (!Number.isFinite(value)) value = 3
  value = Math.floor(value)
  if (value <= 0) value = 1
  if (value >= 5) value = 4
  securityConfig.value.maxLoginRetries = value
}

function normalizeLockMinutes() {
  let value = Number(securityConfig.value.lockMinutes)
  if (!Number.isFinite(value)) value = 30
  value = Math.max(1, Math.floor(value))
  securityConfig.value.lockMinutes = value
}

function normalizeRateLimit(field) {
  let value = Number(securityConfig.value[field])
  if (!Number.isFinite(value)) value = 50
  value = Math.max(0, Math.floor(value))
  securityConfig.value[field] = value
}

function saveListenConfig() {
  savedListenConfig.value = { ...listenConfig.value }
}

function saveSecurityConfig() {
  clampLoginRetries()
  normalizeLockMinutes()
  savedSecurityConfig.value = { ...securityConfig.value }
}

function normalizeSessionTtl() {
  let value = Number(sessionSettings.value.sessionTtlMinutes)
  if (!Number.isFinite(value)) value = 45
  value = Math.floor(value)
  value = Math.max(sessionLimits.value.minimumMinutes, value)
  value = Math.min(sessionLimits.value.maximumMinutes, value)
  sessionSettings.value.sessionTtlMinutes = value
}

function applySessionSettings(data) {
  const sessionTtlMinutes = Number(data?.sessionTtlMinutes) || 45
  sessionLimits.value = {
    minimumMinutes: Number(data?.minimumMinutes) || 5,
    maximumMinutes: Number(data?.maximumMinutes) || 1440
  }
  sessionSettings.value = {
    sessionTtlMinutes,
    invalidateOtherSessions: false
  }
  savedSessionSettings.value = { sessionTtlMinutes }
}

async function fetchSessionSettings() {
  loadingSessionSettings.value = true
  try {
    const response = await http.get('/api/config/security/session')
    if (response.data?.success !== true || !response.data?.data) {
      throw new Error('服务器未返回有效会话策略')
    }
    applySessionSettings(response.data.data)
  } catch (error) {
    console.error('fetch session settings failed', error)
    pushAlert(
      'error',
      '会话策略加载失败',
      error?.response?.status === 403 ? '仅管理员可以查看会话策略。' : '请稍后刷新页面重试。'
    )
  } finally {
    loadingSessionSettings.value = false
  }
}

async function saveSessionSettings() {
  if (savingSessionSettings.value) return false
  normalizeSessionTtl()
  savingSessionSettings.value = true
  try {
    const response = await http.post('/api/config/security/session', {
      sessionTtlMinutes: sessionSettings.value.sessionTtlMinutes,
      invalidateOtherSessions: sessionSettings.value.invalidateOtherSessions
    })
    if (response.data?.success !== true || !response.data?.data) {
      throw new Error('服务器未确认会话策略写入成功')
    }
    const invalidatedCount = Number(response.data.data.invalidatedSessionCount) || 0
    applySessionSettings(response.data.data)
    const description = invalidatedCount > 0
      ? `新登录会话将使用新的有效期，另有 ${invalidatedCount} 个会话已注销。`
      : '新的有效期将在下次登录时生效，当前会话保持不变。'
    pushAlert('success', '会话策略已保存', description, 6000)
    return true
  } catch (error) {
    console.error('save session settings failed', error)
    pushAlert(
      'error',
      '会话策略保存失败',
      error?.response?.data?.message || '请检查输入后重试。'
    )
    return false
  } finally {
    savingSessionSettings.value = false
  }
}

function applyTrustedProxySettings(data, limits = {}) {
  const configuredHeader = typeof data?.clientIpHeader === 'string'
    ? data.clientIpHeader.trim().toLowerCase()
    : 'x-forwarded-for'
  const clientIpHeaderMode = BUILT_IN_CLIENT_IP_HEADERS.includes(configuredHeader)
    ? configuredHeader
    : 'custom'
  const next = {
    trustedProxyCidrsText: Array.isArray(data?.trustedProxyCidrs)
      ? data.trustedProxyCidrs.join('\n')
      : '',
    clientIpHeaderMode,
    customClientIpHeader: clientIpHeaderMode === 'custom' ? configuredHeader : ''
  }
  trustedProxySettings.value = next
  savedTrustedProxySettings.value = { ...next }
  trustedProxyLimits.value = {
    maximumCidrs: Number(limits?.maximumCidrs) || 32,
    maximumHeaderNameLength: Number(limits?.maximumHeaderNameLength) || 64,
    supportsCustomHeader: limits?.supportsCustomHeader === true
  }
}

async function fetchTrustedProxySettings() {
  loadingTrustedProxySettings.value = true
  try {
    const response = await http.get('/api/config/security/trusted-proxies')
    if (response.data?.success !== true || !response.data?.data) {
      throw new Error('服务器未返回有效可信代理配置')
    }
    applyTrustedProxySettings(response.data.data, response.data.limits)
  } catch (error) {
    console.error('fetch trusted proxy settings failed', error)
    pushAlert(
      'error',
      '可信代理配置加载失败',
      error?.response?.status === 403 ? '仅管理员可以查看可信代理配置。' : '请稍后刷新页面重试。'
    )
  } finally {
    loadingTrustedProxySettings.value = false
  }
}

async function saveTrustedProxySettings() {
  if (savingTrustedProxySettings.value) return false
  if (customClientIpHeaderError.value) {
    pushAlert('warning', '自定义请求头无效', customClientIpHeaderError.value)
    return false
  }
  if (trustedProxyCidrs.value.length > trustedProxyLimits.value.maximumCidrs) {
    pushAlert(
      'warning',
      '可信代理配置过多',
      `最多允许 ${trustedProxyLimits.value.maximumCidrs} 条 CIDR。`
    )
    return false
  }
  savingTrustedProxySettings.value = true
  try {
    const response = await http.post('/api/config/security/trusted-proxies', {
      trustedProxyCidrs: trustedProxyCidrs.value,
      clientIpHeader: resolvedClientIpHeader(trustedProxySettings.value)
    })
    if (response.data?.success !== true || !response.data?.data) {
      throw new Error('服务器未确认可信代理配置写入成功')
    }
    applyTrustedProxySettings(response.data.data, response.data.limits)
    pushAlert('success', '可信代理配置已保存', '新的来源 IP 解析规则已经即时生效。', 6000)
    return true
  } catch (error) {
    console.error('save trusted proxy settings failed', error)
    pushAlert(
      'error',
      '可信代理配置保存失败',
      error?.response?.data?.message || '请检查 CIDR 和代理请求头后重试。'
    )
    return false
  } finally {
    savingTrustedProxySettings.value = false
  }
}

function normalizeMailSettings(data) {
  return {
    mail: {
      testRecipient: data?.recipient || '',
      smtpHost: data?.smtpHost || '',
      smtpPort: Number(data?.smtpPort) || 465,
      sender: data?.sender || '',
      senderKey: ''
    },
    preferences: {
      loginNotifyEnabled: data?.notificationPrefs?.loginNotifyEnabled ?? true,
      notifyOnStuck: data?.notificationPrefs?.notifyOnStuck ?? true,
      notifyOnComplete: data?.notificationPrefs?.notifyOnComplete ?? true,
      reportDaily: data?.notificationPrefs?.reportDaily ?? false,
      reportWeekly: data?.notificationPrefs?.reportWeekly ?? true,
      reportMonthly: data?.notificationPrefs?.reportMonthly ?? false,
      healthAlertEnabled: data?.notificationPrefs?.healthAlertEnabled ?? true
    },
    senderKeyConfigured: Boolean(data?.senderKeyConfigured)
  }
}

function applyMailSettings(data) {
  const normalized = normalizeMailSettings(data)
  mailConfig.value = normalized.mail
  notificationPrefs.value = normalized.preferences
  savedMailConfig.value = { ...normalized.mail }
  savedNotificationPrefs.value = { ...normalized.preferences }
  senderKeyConfigured.value = normalized.senderKeyConfigured
}

async function fetchMailSettings() {
  loadingMailConfig.value = true
  try {
    const response = await http.get('/api/config/mail')
    if (response.data?.success !== true || !response.data?.data) {
      throw new Error('服务器未返回有效邮件配置')
    }
    applyMailSettings(response.data.data)
  } catch (error) {
    console.error('fetch mail settings failed', error)
    const description = error?.response?.status === 403
      ? '仅管理员可以查看系统邮件配置。'
      : '请稍后刷新页面重试。'
    pushAlert('error', '邮件配置加载失败', description)
  } finally {
    loadingMailConfig.value = false
  }
}

function validateMailConfig() {
  if (!mailConfig.value.testRecipient.trim()) return '请输入测试收件人邮箱'
  if (!mailConfig.value.smtpHost.trim()) return '请输入邮件服务器地址'
  const port = Number(mailConfig.value.smtpPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return '邮件服务器端口必须在 1 到 65535 之间'
  if (!mailConfig.value.sender.trim()) return '请输入发件人邮箱'
  if (!mailConfig.value.senderKey && !senderKeyConfigured.value) return '首次保存时必须填写发件邮箱密钥'
  return ''
}

async function saveNotifyConfig() {
  if (savingNotifyConfig.value) return false
  const validationMessage = validateMailConfig()
  if (validationMessage) {
    pushAlert('warning', '邮件配置不完整', validationMessage)
    return false
  }

  savingNotifyConfig.value = true
  try {
    const response = await http.post('/api/config/mail', {
      recipient: mailConfig.value.testRecipient.trim(),
      smtpHost: mailConfig.value.smtpHost.trim(),
      smtpPort: Number(mailConfig.value.smtpPort),
      sender: mailConfig.value.sender.trim(),
      senderKey: mailConfig.value.senderKey,
      notificationPrefs: { ...notificationPrefs.value }
    })
    if (response.data?.success !== true || !response.data?.data) {
      throw new Error('服务器未确认邮件配置写入成功')
    }
    applyMailSettings(response.data.data)
    pushAlert('success', '邮件配置已保存', 'SMTP 配置和通知偏好已写入数据库。', 5000)
    return true
  } catch (error) {
    console.error('save mail settings failed', error)
    pushAlert(
      'error',
      '邮件配置保存失败',
      error?.response?.data?.message || '请检查网络连接后重试。'
    )
    return false
  } finally {
    savingNotifyConfig.value = false
  }
}

async function saveAllSettings() {
  if (showListenSave.value) saveListenConfig()
  if (showSecuritySave.value) saveSecurityConfig()
  if (showSessionSave.value && !await saveSessionSettings()) return false
  if (showTrustedProxySave.value && !await saveTrustedProxySettings()) return false
  if (showNotifySave.value && !await saveNotifyConfig()) return false
  return true
}

useUnsavedChanges(hasUnsavedChanges, saveAllSettings)

async function testMailServer() {
  if (testingMailServer.value) return
  const validationMessage = validateMailConfig()
  if (validationMessage) {
    pushAlert('warning', '无法测试邮件服务器', validationMessage)
    return
  }

  testingMailServer.value = true
  try {
    const response = await http.post('/api/mail/smtp/test', {
      recipient: mailConfig.value.testRecipient.trim(),
      smtpHost: mailConfig.value.smtpHost.trim(),
      smtpPort: Number(mailConfig.value.smtpPort),
      sender: mailConfig.value.sender.trim(),
      senderKey: mailConfig.value.senderKey
    })
    pushAlert('success', '测试邮件已发送', response.data?.message || '请检查收件箱。', 5000)
  } catch (error) {
    console.error('test mail server failed', error)
    pushAlert(
      'error',
      '邮件服务器测试失败',
      error?.response?.data?.message || '请核对服务器地址、端口和邮箱密钥。'
    )
  } finally {
    testingMailServer.value = false
  }
}

onMounted(() => {
  fetchMailSettings()
  fetchSessionSettings()
  fetchTrustedProxySettings()
})
</script>

<template>
  <div class="pointer-events-none fixed top-20 left-1/2 z-50 flex w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2 sm:left-auto sm:right-5 sm:w-auto sm:translate-x-0 sm:items-end">
    <AppAlert
      v-for="alert in alerts"
      :key="alert.id"
      class="pointer-events-auto"
      :type="alert.type"
      :title="alert.title"
      :description="alert.description"
      :timeout="alert.timeout"
      @close="closeAlert(alert.id)"
    />
  </div>

  <div class="p-5">
    <div class="mb-4">
      <h2 class="text-lg font-semibold">系统设置</h2>
      <p class="text-xs opacity-60">系统运行、安全策略与通知方式</p>
    </div>

    <div class="grid grid-cols-1 gap-5">
      <div class="card bg-base-100 card-border border-base-300 p-4">
        <div class="flex items-start justify-between mb-3">
          <h3 class="font-semibold">当前监听主机和端口</h3>
          <button
            class="btn rounded-lg btn-neutral btn-sm"
            :class="showListenSave ? 'visible' : 'invisible'"
            :disabled="!showListenSave"
            @click="saveListenConfig"
          >
            保存
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label class="form-control w-full">
            <span class="label-text mb-1">监听主机</span>
            <input v-model="listenConfig.host" type="text" class="input input-bordered w-full" placeholder="例如: 0.0.0.0" />
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1">监听端口</span>
            <input v-model="listenConfig.port" type="number" class="input input-bordered w-full" placeholder="例如: 8080" />
          </label>
        </div>
      </div>

      <div class="card bg-base-100 card-border border-base-300 p-4">
        <div class="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 class="font-semibold">来源 IP 可信代理</h3>
            <p class="mt-1 text-xs opacity-60">统一控制请求日志、审计、限流和扫描器接口如何从反向代理请求头还原客户端地址。</p>
          </div>
          <button
            class="btn rounded-lg btn-neutral btn-sm"
            :class="showTrustedProxySave ? 'visible' : 'invisible'"
            :disabled="!showTrustedProxySave || loadingTrustedProxySettings || savingTrustedProxySettings"
            @click="saveTrustedProxySettings"
          >
            <span v-if="savingTrustedProxySettings" class="loading loading-spinner loading-xs"></span>
            {{ savingTrustedProxySettings ? '保存中' : '保存' }}
          </button>
        </div>

        <div v-if="loadingTrustedProxySettings" class="flex items-center gap-2 py-3 text-sm opacity-60">
          <span class="loading loading-spinner loading-sm"></span>
          正在读取可信代理配置...
        </div>

        <fieldset v-else :disabled="savingTrustedProxySettings" class="space-y-4">
          <div class="alert alert-warning alert-soft py-3 text-sm">
            <span>此配置影响全站来源 IP 判定。仅填写实际反向代理的地址范围，推荐使用单地址 /32 或 /128。代理必须覆盖或安全追加所选请求头，不能直接透传客户端提交的同名字段。留空时忽略所有转发头；禁止配置 0.0.0.0/0 或 ::/0。</span>
          </div>

          <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div class="space-y-3">
              <label class="form-control w-full">
                <span class="label-text mb-1">客户端 IP 请求头</span>
                <select v-model="trustedProxySettings.clientIpHeaderMode" class="select select-bordered w-full">
                  <option value="x-forwarded-for">X-Forwarded-For</option>
                  <option value="forwarded">Forwarded（RFC 7239）</option>
                  <option
                    v-if="trustedProxyLimits.supportsCustomHeader || trustedProxySettings.clientIpHeaderMode === 'custom'"
                    value="custom"
                  >
                    自定义请求头
                  </option>
                </select>
                <span class="label-text-alt mt-1 opacity-60">只解析选中的一种请求头，避免不同代理头之间产生歧义。</span>
              </label>

              <label v-if="trustedProxySettings.clientIpHeaderMode === 'custom'" class="form-control w-full">
                <span class="label-text mb-1">自定义请求头名称</span>
                <input
                  v-model="trustedProxySettings.customClientIpHeader"
                  type="text"
                  class="input input-bordered w-full font-mono"
                  :class="{ 'input-error': customClientIpHeaderError }"
                  placeholder="例如: X-Real-IP"
                  :maxlength="trustedProxyLimits.maximumHeaderNameLength"
                  autocomplete="off"
                  spellcheck="false"
                />
                <span
                  class="label-text-alt mt-1"
                  :class="customClientIpHeaderError ? 'text-error' : 'opacity-60'"
                >
                  {{ customClientIpHeaderError || '支持单个 IP 或逗号分隔的 IP 代理链，例如 CF-Connecting-IP。' }}
                </span>
              </label>
            </div>

            <label class="form-control w-full lg:col-span-2">
              <span class="label-text mb-1">可信代理 CIDR</span>
              <textarea
                v-model="trustedProxySettings.trustedProxyCidrsText"
                class="textarea textarea-bordered min-h-28 w-full font-mono text-sm"
                placeholder="127.0.0.1/32&#10;::1/128"
              ></textarea>
              <span class="label-text-alt mt-1 opacity-60">
                每行一条，也可使用逗号分隔；当前 {{ trustedProxyCidrs.length }}/{{ trustedProxyLimits.maximumCidrs }} 条。
              </span>
            </label>
          </div>

          <div class="rounded-lg bg-base-200/60 p-3 text-xs leading-5 opacity-75">
            服务端在请求入口统一解析一次来源 IP：先验证 TCP 直连地址是否属于可信代理，再从右向左剥离代理链并选择第一个非可信地址。自定义请求头按裸 IP 或逗号分隔的 IP 链解析；Forwarded 按 RFC 7239 的 for 参数解析。未命中可信 CIDR、请求头缺失、格式错误或整条链均为可信地址时，都会安全回退到 TCP 对端地址。
          </div>
        </fieldset>
      </div>

      <div class="card bg-base-100 card-border border-base-300 p-4">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 class="font-semibold">会话策略</h3>
            <p class="text-xs opacity-60 mt-1">控制用户登录后的绝对有效期，不会因持续操作自动续期。</p>
          </div>
          <button
            class="btn rounded-lg btn-neutral btn-sm"
            :class="showSessionSave ? 'visible' : 'invisible'"
            :disabled="!showSessionSave || loadingSessionSettings || savingSessionSettings"
            @click="saveSessionSettings"
          >
            <span v-if="savingSessionSettings" class="loading loading-spinner loading-xs"></span>
            {{ savingSessionSettings ? '保存中' : '保存' }}
          </button>
        </div>

        <div v-if="loadingSessionSettings" class="flex items-center gap-2 text-sm opacity-60">
          <span class="loading loading-spinner loading-sm"></span>
          正在读取会话策略...
        </div>

        <fieldset v-else :disabled="savingSessionSettings" class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <label class="form-control w-full">
            <span class="label-text mb-1">登录会话最长有效期 <span class="text-xs opacity-60">（分钟）</span></span>
            <input
              v-model.number="sessionSettings.sessionTtlMinutes"
              type="number"
              :min="sessionLimits.minimumMinutes"
              :max="sessionLimits.maximumMinutes"
              step="1"
              class="input input-bordered w-full"
              placeholder="45"
              @blur="normalizeSessionTtl"
            />
            <span class="label-text-alt opacity-60 mt-1">
              允许 {{ sessionLimits.minimumMinutes }}-{{ sessionLimits.maximumMinutes }} 分钟，仅影响新登录会话。
            </span>
          </label>

          <label class="rounded-lg bg-base-200/60 p-3 flex items-start gap-3 cursor-pointer">
            <input v-model="sessionSettings.invalidateOtherSessions" type="checkbox" class="checkbox rounded-md mt-0.5" />
            <span class="text-sm">
              <span class="font-medium block">保存后注销其他现有会话</span>
              <span class="text-xs opacity-60">保留当前管理员会话，其余用户需要重新登录。</span>
            </span>
          </label>
        </fieldset>
      </div>

      <div class="card bg-base-100 card-border border-base-300 p-4">
        <div class="flex items-start justify-between mb-3">
          <h3 class="font-semibold">系统安全</h3>
          <button
            class="btn rounded-lg btn-neutral btn-sm"
            :class="showSecuritySave ? 'visible' : 'invisible'"
            :disabled="!showSecuritySave"
            @click="saveSecurityConfig"
          >
            保存
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label class="form-control w-full">
            <span class="label-text mb-1">限制登录错误次数</span>
            <input
              v-model.number="securityConfig.maxLoginRetries"
              type="number"
              min="1"
              max="4"
              step="1"
              class="input input-bordered w-full"
              @blur="clampLoginRetries"
              @input="clampLoginRetries"
            />
            <span class="label-text-alt opacity-60 mt-1">仅允许输入 1-4 的整数，默认 3</span>
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1">锁定时间 <span class="text-xs opacity-60">（分钟）</span></span>
            <input
              v-model.number="securityConfig.lockMinutes"
              type="number"
              min="1"
              step="1"
              class="input input-bordered w-full"
              placeholder="例如: 30"
              @blur="normalizeLockMinutes"
              @input="normalizeLockMinutes"
            />
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1">请求速率限制（API 路径）</span>
            <input
              v-model.number="securityConfig.apiRateLimit"
              type="number"
              min="0"
              step="1"
              class="input input-bordered w-full"
              placeholder="50"
              @blur="normalizeRateLimit('apiRateLimit')"
              @input="normalizeRateLimit('apiRateLimit')"
            />
            <span class="label-text-alt opacity-60 mt-1">单位：次/秒，0 表示不限制</span>
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1">请求速率限制（普通页面）</span>
            <input
              v-model.number="securityConfig.pageRateLimit"
              type="number"
              min="0"
              step="1"
              class="input input-bordered w-full"
              placeholder="50"
              @blur="normalizeRateLimit('pageRateLimit')"
              @input="normalizeRateLimit('pageRateLimit')"
            />
            <span class="label-text-alt opacity-60 mt-1">单位：次/秒，0 表示不限制</span>
          </label>
        </div>
      </div>

      <div class="card bg-base-100 card-border border-base-300 p-4">
        <div class="flex items-start justify-between mb-4">
          <h3 class="font-semibold">通知</h3>
          <button
            class="btn rounded-lg btn-neutral btn-sm"
            :class="showNotifySave ? 'visible' : 'invisible'"
            :disabled="!showNotifySave || loadingMailConfig || savingNotifyConfig || testingMailServer"
            @click="saveNotifyConfig"
          >
            <span v-if="savingNotifyConfig" class="loading loading-spinner loading-xs"></span>
            {{ savingNotifyConfig ? '保存中' : '保存' }}
          </button>
        </div>

        <div v-if="loadingMailConfig" class="mb-4 flex items-center gap-2 text-sm opacity-60">
          <span class="loading loading-spinner loading-sm"></span>
          正在读取邮件配置...
        </div>

        <fieldset
          :disabled="loadingMailConfig || savingNotifyConfig || testingMailServer"
          class="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start"
        >
          <div class="xl:col-span-2 flex flex-col gap-3">
            <div class="card bg-base-100 border border-base-300 p-4">
              <div class="flex items-center justify-between">
                <h4 class="font-medium">登录通知</h4>
                <input v-model="notificationPrefs.loginNotifyEnabled" type="checkbox" class="toggle" />
              </div>
              <p class="text-xs opacity-60 mt-2">当用户登录系统时，通知会发送到该用户个人资料中的邮箱。</p>
            </div>

            <div class="card bg-base-100 border border-base-300 p-4">
              <div class="flex items-center justify-between">
                <h4 class="font-medium">健康告警</h4>
                <input v-model="notificationPrefs.healthAlertEnabled" type="checkbox" class="toggle" />
              </div>
              <p class="text-xs opacity-60 mt-2">检测到慢请求、5xx 错误或慢 SQL 时，通过邮件通知所有启用中的管理员。</p>
            </div>

            <div class="card bg-base-100 border border-base-300 p-4">
              <h4 class="font-medium mb-3">任务通知</h4>
              <div class="flex flex-col gap-2">
                <label class="w-full rounded-lg bg-base-200/60 p-3 flex items-start gap-3">
                  <input v-model="notificationPrefs.notifyOnStuck" type="checkbox" class="checkbox rounded-md mt-0.5" />
                  <span class="text-sm">
                    <span class="font-medium block">错误时通知</span>
                    <span class="text-xs opacity-60">当一个任务长时间没有进展则触发。</span>
                  </span>
                </label>

                <label class="w-full rounded-lg bg-base-200/60 p-3 flex items-start gap-3">
                  <input v-model="notificationPrefs.notifyOnComplete" type="checkbox" class="checkbox rounded-md mt-0.5" />
                  <span class="text-sm">
                    <span class="font-medium block">完成时通知</span>
                    <span class="text-xs opacity-60">当任务完成后立即发送通知。</span>
                  </span>
                </label>
              </div>
            </div>

            <div class="card bg-base-100 border border-base-300 p-4">
              <h4 class="font-medium mb-3">报告通知</h4>
              <div class="flex flex-col gap-2">
                <label class="w-full rounded-lg bg-base-200/60 px-3 py-2 flex items-center gap-3">
                  <input v-model="notificationPrefs.reportDaily" type="checkbox" class="checkbox rounded-md" />
                  <span class="text-sm">日报</span>
                </label>
                <label class="w-full rounded-lg bg-base-200/60 px-3 py-2 flex items-center gap-3">
                  <input v-model="notificationPrefs.reportWeekly" type="checkbox" class="checkbox rounded-md" />
                  <span class="text-sm">周报</span>
                </label>
                <label class="w-full rounded-lg bg-base-200/60 px-3 py-2 flex items-center gap-3">
                  <input v-model="notificationPrefs.reportMonthly" type="checkbox" class="checkbox rounded-md" />
                  <span class="text-sm">月报</span>
                </label>
              </div>
            </div>
          </div>

          <div class="xl:col-span-1">
            <div class="card bg-base-100 border border-base-300 p-4 h-full">
              <h4 class="font-medium mb-3">邮件通知配置</h4>
              <div class="grid grid-cols-1 gap-3">
                <label class="form-control w-full">
                  <span class="label-text mb-1">测试收件人</span>
                  <input v-model="mailConfig.testRecipient" type="email" class="input input-bordered w-full" placeholder="name@example.com" />
                  <span class="label-text-alt mt-1 opacity-60">仅用于测试 SMTP 和邮件模板，不会接收用户的真实通知。</span>
                </label>

                <label class="form-control w-full">
                  <span class="label-text mb-1">邮件服务器</span>
                  <input v-model="mailConfig.smtpHost" type="text" class="input input-bordered w-full" placeholder="smtp.example.com" />
                </label>

                <label class="form-control w-full">
                  <span class="label-text mb-1">服务器端口</span>
                  <input
                    v-model.number="mailConfig.smtpPort"
                    type="number"
                    min="1"
                    max="65535"
                    step="1"
                    class="input input-bordered w-full"
                    placeholder="465"
                  />
                </label>

                <label class="form-control w-full">
                  <span class="label-text mb-1">发件人地址</span>
                  <input v-model="mailConfig.sender" type="email" class="input input-bordered w-full" placeholder="scanner@example.com" />
                </label>

                <label class="form-control w-full">
                  <span class="label-text mb-1">发件邮箱密钥</span>
                  <div class="relative">
                    <input
                      v-model="mailConfig.senderKey"
                      :type="showSenderKey ? 'text' : 'password'"
                      class="input input-bordered w-full pr-10"
                      :placeholder="senderKeyConfigured ? '已保存，留空表示不修改' : '请输入发件邮箱密钥'"
                    />
                    <button type="button" class="btn btn-ghost btn-sm absolute right-1 top-1/2 -translate-y-1/2" @click="showSenderKey = !showSenderKey">
                      <svg
                        v-if="!showSenderKey"
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class="lucide lucide-eye-icon lucide-eye"
                      >
                        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <svg
                        v-else
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class="lucide lucide-eye-off-icon lucide-eye-off"
                      >
                        <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                        <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                        <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                        <path d="m2 2 20 20" />
                      </svg>
                    </button>
                  </div>
                  <span v-if="senderKeyConfigured && !mailConfig.senderKey" class="label-text-alt opacity-60 mt-1">
                    已配置邮箱密钥；服务器不会将密钥回传到浏览器。
                  </span>
                </label>

                <button
                  class="btn btn-neutral w-full mt-2"
                  :disabled="testingMailServer"
                  @click="testMailServer"
                >
                  <span v-if="testingMailServer" class="loading loading-spinner loading-sm"></span>
                  {{ testingMailServer ? '正在发送测试邮件' : '测试邮件服务器' }}
                </button>
              </div>
            </div>
          </div>
        </fieldset>
      </div>
    </div>
  </div>
</template>
