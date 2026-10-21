<script setup>
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { formatDateTime } from '@/utils/systemTime'
import { channelForm, channelPayload, deliveryReason, deliveryStatuses, eventLabel, notificationEvents, notificationProviders, providerLabel, validateChannel } from '@/utils/notifications'
import http from '@/utils/http'

const formFieldId = useId()
const channels = ref([]), deliveries = ref([]), alerts = ref([])
const loading = ref(false), busy = ref(false), forbidden = ref(false), loadFailed = ref(false)
const editor = ref(null), form = ref(channelForm()), savedForm = ref('')
const filterChannel = ref(''), filterStatus = ref(''), nextBefore = ref(null)
const historyLoading = ref(false), historyFailed = ref(false), lastRefresh = ref(null)
const browsingHistory = ref(false)
const dirty = computed(() => Boolean(editor.value?.open) && JSON.stringify(form.value) !== savedForm.value)
useUnsavedChanges(dirty, save)
let sequence = 0, timer, disposed = false
const readControllers = new Set()

function notify(type, title, description = '') {
  alerts.value.unshift({ id: crypto.randomUUID(), type, title, description, timeout: 7000 })
}
function dataOf(response) {
  if (response.data?.success !== true) throw new Error('通知服务响应无效')
  return response.data.data
}
function errorText(error) { return error.response?.data?.message || '操作失败，请检查网络连接后重试。' }
async function loadChannels() {
  if (disposed) return
  const controller = new AbortController()
  readControllers.add(controller)
  loading.value = true
  try {
    const response = await http.get('/api/notifications/channels', { signal: controller.signal })
    if (disposed) return
    const data = dataOf(response)
    if (!Array.isArray(data)) throw new Error('渠道列表无效')
    channels.value = data
    loadFailed.value = false
    forbidden.value = false
  } catch (error) {
    if (disposed || controller.signal.aborted) return
    loadFailed.value = true
    forbidden.value = error.response?.status === 403
    if (forbidden.value) { channels.value = []; deliveries.value = [] }
  } finally {
    readControllers.delete(controller)
    if (!disposed) loading.value = false
  }
}
async function loadHistory(append = false) {
  if (disposed) return
  const controller = new AbortController()
  readControllers.add(controller)
  browsingHistory.value = append
  const request = ++sequence
  historyLoading.value = true
  const params = {}
  if (filterChannel.value) params.channel_id = filterChannel.value
  if (filterStatus.value) params.status = filterStatus.value
  if (append && nextBefore.value) params.before = nextBefore.value
  try {
    const response = await http.get('/api/notifications/deliveries', { params, signal: controller.signal })
    if (disposed || request !== sequence) return
    const data = dataOf(response)
    if (!Array.isArray(data?.items)) throw new Error('投递记录无效')
    deliveries.value = append ? [...deliveries.value, ...data.items] : data.items
    nextBefore.value = data.next_before
    historyFailed.value = false
    lastRefresh.value = new Date()
  } catch (error) {
    if (disposed || controller.signal.aborted || request !== sequence) return
    historyFailed.value = true
    if (error.response?.status === 403) { forbidden.value = true; deliveries.value = [] }
  } finally {
    readControllers.delete(controller)
    if (!disposed && request === sequence) historyLoading.value = false
  }
}
function openEditor(channel) {
  form.value = channelForm(channel)
  savedForm.value = JSON.stringify(form.value)
  editor.value?.showModal()
}
function closeEditor() {
  if (dirty.value && !window.confirm('有未保存的渠道配置，确定放弃修改吗？')) return
  editor.value?.close()
  form.value = channelForm()
  savedForm.value = ''
}
async function save() {
  if (busy.value) return
  const problem = validateChannel(form.value)
  if (problem) { notify('warning', '请检查渠道配置', problem); return }
  busy.value = true
  try {
    dataOf(await http({ method: form.value.id ? 'PUT' : 'POST', url: `/api/notifications/channels${form.value.id ? `/${form.value.id}` : ''}`, data: channelPayload(form.value) }))
    savedForm.value = JSON.stringify(form.value)
    editor.value?.close()
    form.value = channelForm()
    notify('success', '渠道已保存', '已取消该渠道尚未完成的旧投递；后续事件使用新配置。')
    await loadChannels()
    await loadHistory()
  } catch (error) { notify('error', '保存失败', errorText(error)) }
  finally { busy.value = false }
}
async function action(channel, kind) {
  if (busy.value) return
  if (kind === 'delete' && !window.confirm(`确定删除“${channel.name}”并取消其待处理通知吗？`)) return
  busy.value = true
  try {
    if (kind === 'test') {
      const data = dataOf(await http.post(`/api/notifications/channels/${channel.id}/test`))
      notify('success', '测试已入队', `请在投递记录中查看结果。投递 ID：${data.delivery_id}`)
    } else if (kind === 'delete') {
      dataOf(await http.delete(`/api/notifications/channels/${channel.id}`, { data: { expected_revision: channel.revision } }))
      if (filterChannel.value === channel.id) filterChannel.value = ''
      notify('success', '渠道已删除')
    } else {
      const payload = channelPayload(channelForm(channel))
      payload.enabled = !channel.enabled
      dataOf(await http.put(`/api/notifications/channels/${channel.id}`, payload))
      notify('success', payload.enabled ? '渠道已启用' : '渠道已停用')
    }
    await loadChannels()
    await loadHistory()
  } catch (error) { notify('error', '操作失败', errorText(error)) }
  finally { busy.value = false }
}
async function retry(item) {
  if (busy.value) return
  busy.value = true
  try {
    dataOf(await http.post(`/api/notifications/deliveries/${item.id}/retry`))
    notify('success', '已重新入队', '重试可能产生重复消息，请关注事件 ID。')
    await loadHistory()
  } catch (error) { notify('error', '重试失败', errorText(error)) }
  finally { busy.value = false }
}
async function refresh() { await loadChannels(); if (!disposed && !forbidden.value) await loadHistory() }
onMounted(async () => {
  await refresh()
  if (disposed) return
  timer = window.setInterval(() => {
    if (!disposed && !document.hidden && !busy.value && !historyLoading.value && !forbidden.value && !browsingHistory.value) loadHistory()
  }, 15000)
})
onBeforeUnmount(() => {
  disposed = true
  ++sequence
  window.clearInterval(timer)
  for (const controller of readControllers) controller.abort()
  readControllers.clear()
})
</script>

<template>
  <div class="page-shell space-y-6">
    <AppAlert v-for="item in alerts" :key="item.id" v-bind="item" @close="alerts = alerts.filter(value => value.id !== item.id)" />
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div><h1 class="page-title">通知渠道</h1><p class="mt-2 text-sm opacity-60">统一管理邮件、飞书和 Telegram。各渠道独立启停、订阅通知，同一事件可同时发送到多个渠道。</p></div>
      <div v-if="!forbidden" class="flex gap-2"><button class="btn btn-sm" :disabled="loading || historyLoading" @click="refresh">刷新</button><button class="btn btn-neutral btn-sm" :disabled="busy || loadFailed" @click="openEditor()">添加通知渠道</button></div>
    </div>
    <div v-if="forbidden" class="alert alert-warning" role="alert">仅管理员可以管理通知渠道和查看投递记录。</div>
    <template v-else>
      <div v-if="loadFailed" class="alert alert-error" role="alert"><span>渠道加载失败，请刷新后重试。</span><button class="btn btn-sm" @click="refresh">重试</button></div>
      <section class="rounded-xl bg-base-100 p-4 md:p-6">
        <h2 class="text-lg font-semibold">渠道与事件订阅</h2>
        <p class="mt-1 text-sm opacity-60">三种渠道提供相同的通知类型，可以只启用一种，也可以同时启用。修改或停用会取消旧配置下尚未完成的投递。</p>
        <p v-if="loading" class="py-6" role="status">正在加载渠道…</p>
        <p v-else-if="!channels.length && !loadFailed" class="py-8 text-center opacity-60">尚未配置渠道。添加邮件、飞书或 Telegram 渠道后，选择需要接收的通知。</p>
        <div v-else class="mt-4 grid gap-4 lg:grid-cols-2">
          <article v-for="channel in channels" :key="channel.id" class="rounded-lg border border-base-300 p-4">
            <div class="flex items-center justify-between gap-3"><h3 class="break-all font-semibold">{{ channel.name }}</h3><span class="badge badge-sm" :class="channel.enabled ? 'badge-success' : 'badge-ghost'">{{ channel.enabled ? '已启用' : '已停用' }}</span></div>
            <span class="badge badge-outline badge-sm mt-2">{{ providerLabel(channel.provider || 'feishu') }}</span>
            <p class="mt-2 text-sm">{{ channel.event_types.map(eventLabel).join(' · ') }}</p>
            <p class="mt-2 text-xs opacity-60">{{ channel.minimum_severity === 'critical' ? '仅严重通知' : '警告及严重通知' }} · {{ channel.provider === 'feishu' ? (channel.signing_secret_configured ? '已配置签名' : '未配置签名') : (channel.credential_configured ? '已配置凭据' : '待配置凭据') }} · 版本 {{ channel.revision }}</p>
            <p class="mt-1 text-xs opacity-60 break-all">代理：{{ channel.proxy_mode === 'custom' ? channel.proxy_endpoint : channel.proxy_mode === 'direct' ? '直接连接' : '沿用系统' }}</p>
            <div class="mt-4 flex flex-wrap gap-2">
              <button class="btn btn-sm" :disabled="busy || loadFailed" @click="openEditor(channel)">编辑</button>
              <button class="btn btn-sm" :disabled="busy || !channel.enabled || loadFailed" @click="action(channel, 'test')">测试发送</button>
              <button class="btn btn-sm" :disabled="busy || loadFailed" @click="action(channel, 'toggle')">{{ channel.enabled ? '停用' : '启用' }}</button>
              <button class="btn btn-ghost btn-sm text-error" :disabled="busy || loadFailed" @click="action(channel, 'delete')">删除</button>
            </div>
          </article>
        </div>
      </section>
      <section class="rounded-xl bg-base-100 p-4 md:p-6">
        <div class="flex flex-wrap items-end justify-between gap-3"><div><h2 class="text-lg font-semibold">投递记录</h2><p class="mt-1 text-xs opacity-60">{{ browsingHistory ? '正在查看历史，已暂停自动刷新。' : '自动刷新最新 50 条；点击加载更多查看历史。' }}{{ lastRefresh ? `最近刷新：${formatDateTime(lastRefresh)}` : '' }}</p></div>
          <div class="flex flex-wrap gap-2"><select v-model="filterChannel" aria-label="筛选通知渠道" class="select select-bordered select-sm" @change="loadHistory()"><option value="">全部渠道</option><option v-for="channel in channels" :key="channel.id" :value="channel.id">{{ channel.name }}</option></select><select v-model="filterStatus" aria-label="筛选投递状态" class="select select-bordered select-sm" @change="loadHistory()"><option value="">全部状态</option><option v-for="(label, value) in deliveryStatuses" :key="value" :value="value">{{ label }}</option></select></div>
        </div>
        <div v-if="historyFailed" class="alert alert-warning mt-4" role="alert"><span>投递记录刷新失败，当前显示上次结果。</span><button class="btn btn-sm" @click="loadHistory()">重试</button></div>
        <div class="mt-4 overflow-x-auto"><table class="table table-sm"><thead><tr><th>时间 / 渠道</th><th>事件</th><th>状态 / 尝试</th><th>结果</th><th /></tr></thead><tbody>
          <tr v-for="item in deliveries" :key="item.id"><td class="whitespace-nowrap"><div>{{ formatDateTime(item.created_at) }}</div><div class="max-w-56 truncate text-xs opacity-60">{{ item.channel_name }}</div></td><td><div>{{ eventLabel(item.event_type) }}</div><div class="max-w-64 truncate text-xs opacity-60" :title="item.title">{{ item.title }}</div></td><td class="whitespace-nowrap"><span class="badge badge-sm" :class="item.status === 'sent' ? 'badge-success' : item.status === 'failed' ? 'badge-error' : 'badge-ghost'">{{ deliveryStatuses[item.status] || item.status }}</span><div class="mt-1 text-xs opacity-60">{{ item.attempts }} 次</div></td><td class="min-w-48 text-xs"><div>{{ deliveryReason(item.last_error) }}</div><div v-if="item.response_status || item.provider_code != null" class="mt-1 opacity-60">HTTP {{ item.response_status || '—' }} · 服务码 {{ item.provider_code ?? '—' }}</div><div v-if="item.status === 'pending'" class="mt-1 opacity-60">计划：{{ formatDateTime(item.available_at) }}</div></td><td><button v-if="item.status === 'failed'" class="btn btn-xs" :disabled="busy" @click="retry(item)">重试</button></td></tr>
        </tbody></table></div>
        <p v-if="!deliveries.length && !historyLoading && !historyFailed" class="py-8 text-center text-sm opacity-60">暂无符合条件的投递记录。</p>
        <div class="mt-4 flex justify-center"><button v-if="nextBefore" class="btn btn-sm" :disabled="historyLoading" @click="loadHistory(true)">{{ historyLoading ? '正在加载…' : '加载更多' }}</button><span v-else-if="historyLoading" role="status" class="text-sm opacity-60">正在刷新…</span></div>
      </section>
    </template>
    <dialog ref="editor" class="modal" @cancel.prevent="closeEditor">
      <form class="modal-box space-y-5" @submit.prevent="save">
        <h2 class="text-lg font-semibold">{{ form.id ? '编辑通知渠道' : '添加通知渠道' }}</h2>
        <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-1`">渠道类型</label></legend><select :id="`${formFieldId}-1`" aria-label="渠道类型" v-model="form.provider" :disabled="Boolean(form.id)" class="select select-bordered w-full"><option v-for="provider in notificationProviders" :key="provider.value" :value="provider.value">{{ provider.label }}</option></select></fieldset>
        <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-2`">渠道名称</label></legend><input :id="`${formFieldId}-2`" v-model="form.name" class="input input-bordered w-full" maxlength="80" required autocomplete="off" placeholder="例如：运维告警群" /></fieldset>
        <template v-if="form.provider === 'feishu'">
        <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-3`">Webhook 地址{{ form.id ? '（留空保留）' : '' }}</label></legend><input :id="`${formFieldId}-3`" v-model="form.webhook_url" type="password" class="input input-bordered w-full" :required="!form.id" autocomplete="new-password" placeholder="粘贴飞书自定义机器人 Webhook" /></fieldset>
        <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-4`">签名密钥{{ form.id ? '（留空保留）' : '（建议配置）' }}</label></legend><input :id="`${formFieldId}-4`" v-model="form.signing_secret" type="password" class="input input-bordered w-full" autocomplete="new-password" :disabled="form.clear_signing_secret" /></fieldset>
        <label v-if="form.signing_secret_configured" class="flex items-center gap-2 text-sm"><input v-model="form.clear_signing_secret" type="checkbox" class="checkbox checkbox-sm" />清除已保存的签名密钥</label>
        <p class="text-xs opacity-60">机器人若开启关键词校验，请允许固定前缀“Network Mapping”。</p>
        </template>
        <template v-else-if="form.provider === 'telegram'">
          <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-5`">Bot Token{{ form.id ? '（留空保留）' : '' }}</label></legend><input :id="`${formFieldId}-5`" v-model="form.bot_token" type="password" class="input input-bordered w-full" :required="!form.id" autocomplete="new-password" placeholder="从 BotFather 获取的 Token" /></fieldset>
          <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-6`">Chat ID</label></legend><input :id="`${formFieldId}-6`" v-model="form.settings.chat_id" class="input input-bordered w-full" required placeholder="例如：-1001234567890 或 @channel_name" /></fieldset>
          <p class="text-xs opacity-60">请先将机器人加入目标群或频道并允许发送消息；私聊须先向机器人发送 /start。</p>
        </template>
        <template v-else-if="form.provider === 'email'">
          <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-7`">SMTP 服务器</label></legend><input :id="`${formFieldId}-7`" v-model="form.settings.smtp_host" class="input input-bordered w-full" required placeholder="smtp.example.com" /></fieldset>
          <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-8`">SMTPS 端口</label></legend><input :id="`${formFieldId}-8`" v-model.number="form.settings.smtp_port" type="number" min="1" max="65535" class="input input-bordered w-full" required /></fieldset>
          <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-9`">发件人邮箱 / 登录账号</label></legend><input :id="`${formFieldId}-9`" v-model="form.settings.smtp_sender" type="email" class="input input-bordered w-full" required /></fieldset>
          <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-10`">发件邮箱密钥{{ form.id ? '（留空保留）' : '' }}</label></legend><input :id="`${formFieldId}-10`" v-model="form.smtp_password" type="password" class="input input-bordered w-full" :required="!form.id && !form.credential_configured" autocomplete="new-password" /></fieldset>
          <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label for="notifications-form-recipients-text">收件人（选填，每行一个或逗号分隔）</label></legend><textarea id="notifications-form-recipients-text" v-model="form.recipients_text" class="textarea textarea-bordered w-full" rows="3" placeholder="留空使用事件默认收件人" /></fieldset>
          <p class="text-xs opacity-60">留空时，登录通知发给登录用户本人；报告按报告计划选择管理员，其余通知发给当前启用的管理员。填写后发送到指定邮箱。</p>
        </template>
        <fieldset><legend class="mb-2 text-sm">通知事件</legend><label v-for="event in notificationEvents" :key="event.value" class="mb-2 flex items-center gap-2 text-sm"><input v-model="form.event_types" :value="event.value" type="checkbox" class="checkbox checkbox-sm" />{{ event.label }}</label></fieldset>
        <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-11`">最低通知级别</label></legend><select :id="`${formFieldId}-11`" aria-label="最低通知级别" v-model="form.minimum_severity" class="select select-bordered w-full"><option value="warning">警告及严重（全部已选通知类型）</option><option value="critical">仅严重健康告警（不发送登录、Scanner 或报告通知）</option></select></fieldset>
        <fieldset class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-proxy-mode`">投递代理</label></legend><select :id="`${formFieldId}-proxy-mode`" v-model="form.proxy_mode" class="select select-bordered w-full"><option value="system">沿用系统（HTTP 使用环境代理，SMTP 直连）</option><option value="direct">直接连接</option><option value="custom">指定代理</option></select></fieldset>
        <fieldset v-if="form.proxy_mode === 'custom'" class="fieldset min-w-0 w-full"><legend class="fieldset-legend"><label :for="`${formFieldId}-proxy-url`">代理地址{{ form.proxy_configured ? '（留空保留）' : '' }}</label></legend><input :id="`${formFieldId}-proxy-url`" v-model="form.proxy_url" type="password" autocomplete="new-password" maxlength="2048" class="input input-bordered w-full" placeholder="socks5h://用户名:密码@代理主机:1080" /><p v-if="form.proxy_configured" class="text-xs break-all opacity-60">已配置：{{ form.proxy_endpoint }}（认证信息不回显）</p><p class="text-xs opacity-60">支持 HTTP、HTTPS、SOCKS5 与 SOCKS5H，适用于邮件和机器人。SOCKS5H 由代理解析目标域名。失败时不会回退直连。</p></fieldset>
        <p v-else-if="form.proxy_configured" class="text-xs opacity-60">保存此模式将清除该渠道已保存的代理地址和认证信息。</p>
        <label class="flex items-center gap-2 text-sm"><input v-model="form.enabled" type="checkbox" class="toggle toggle-neutral" />启用渠道</label>
        <p class="text-xs leading-relaxed opacity-60">Webhook、邮箱密钥和 Bot Token 保存后不会回显，编辑留空保留。测试发送需要先保存并启用渠道。</p>
        <div class="modal-action"><button type="button" class="btn btn-sm" :disabled="busy" @click="closeEditor">取消</button><button class="btn btn-neutral btn-sm" :disabled="busy">{{ busy ? '正在保存…' : '保存渠道' }}</button></div>
      </form>
    </dialog>
  </div>
</template>
