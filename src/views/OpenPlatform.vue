<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http from '../utils/http'
import { formatDateTime } from '../utils/systemTime'
import OpenApiPolicyEditor from '../components/OpenApiPolicyEditor.vue'
import { apiError, applicationStatus, cloneDocument, curlExample, endpointPath, isMutation, samplePayload } from '../utils/openApi'

const route = useRoute(), router = useRouter()
const role = ref('developer'), catalog = ref({ scopes: [], fields: [], endpoints: [] }), initialized = ref(false)
const loading = ref(false), acting = ref(false), message = ref(null), overview = ref({}), applications = ref([]), rows = ref([]), nextAfter = ref(null)
const selected = ref(null), details = ref(null), appTab = ref('overview'), appFilter = ref(''), textFilter = ref(''), usage = ref([]), calls = ref([])
const settings = ref({ document: { enabled: false, retention_days: 30, audit_retention_days: 180, webhook_allowed_hosts: [] }, revision: 1 })
const allowedHostsText = ref(''), roles = ref([]), roleForm = ref({ user_id: '', role: 'auditor' })
const policyDraft = ref(null), metadataDraft = ref({ name: '', purpose: '' }), approval = ref(null), approvalPolicy = ref(null), approvalNote = ref('')
const createDialog = ref(null), keyDialog = ref(null), secretDialog = ref(null), verificationDialog = ref(null), approvalDialog = ref(null), webhookDialog = ref(null)
const createForm = ref({ name: '', purpose: '', kind: 'personal', environment: 'production', owner_user_id: '', policy: {} })
const keyForm = ref({ name: '', expires_days: 90, ip_allowlist: '', scopes: [], overlap_hours: 0, rotate: null })
const secret = ref(''), secretTitle = ref(''), verification = ref({ password: '', totp: '' }), subscriptions = ref([])
const webhookForm = ref({ url: '', event_types: [], enabled: true }), applicationJobs = ref([])
const endpointIndex = ref(0), credentialId = ref(''), payloadText = ref('{}'), parameterValues = ref({}), invocationResult = ref(''), invocationBusy = ref(false)
const documentText = ref(''), documentKind = ref('integration'), approvalReason = ref(''), clock = ref(Date.now())
let pendingAction = null, timer = null

const section = computed(() => route.path === '/developer/open-api' ? 'apps' : route.path.split('/')[2] || 'overview')
const isAdmin = computed(() => role.value === 'admin'), isAuditor = computed(() => role.value === 'auditor')
const nav = computed(() => [
  ['overview', '总览'], ['apps', '应用与凭据'], ['catalog', '接口目录与调试'], ['approvals', '申请与审批'],
  ['logs', '调用日志'], ['audit', '操作审计'], ['jobs', '导出与报告'], ['deliveries', '事件投递'], ['docs', '接入文档'],
  ...(isAdmin.value ? [['settings', '平台设置'], ['roles', '管理权限']] : []),
])
const filteredApplications = computed(() => applications.value.filter(a => !textFilter.value || `${a.name} ${a.purpose}`.toLowerCase().includes(textFilter.value.toLowerCase())))
const filteredEndpoints = computed(() => catalog.value.endpoints.filter(e => !textFilter.value || `${e.path} ${e.summary} ${e.scope}`.toLowerCase().includes(textFilter.value.toLowerCase())))
const activeCredentials = computed(() => (details.value?.credentials || []).filter(k => !k.revoked_at && new Date(k.expires_at).getTime() > clock.value))
const endpoint = computed(() => catalog.value.endpoints[endpointIndex.value] || null)
const parameters = computed(() => endpoint.value?.path.match(/\{([^}]+)\}/g)?.map(v => v.slice(1, -1)) || [])
const invocationPath = computed(() => endpointPath(endpoint.value?.path || '', parameterValues.value))
const codeExample = computed(() => { try { return curlExample(window.location.origin, endpoint.value?.method || 'GET', endpointPath(endpoint.value?.path || '', parameterValues.value, true), JSON.parse(payloadText.value)) } catch { return '请求参数必须为有效 JSON。' } })
const canInvoke = computed(() => details.value?.application?.status === 'active' && activeCredentials.value.length && !isAuditor.value)
const scopeSet = computed(() => new Set(details.value?.application?.policy?.scopes || []))
const policyChanges = computed(() => {
  const before = details.value?.application?.policy || {}, after = approvalPolicy.value || policyDraft.value || {}
  return Object.keys(after).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map(k => ({ key: k, before: before[k], after: after[k] }))
})
const appStats = computed(() => ({ active: applications.value.filter(a => a.status === 'active').length, pending: applications.value.filter(a => a.status === 'pending').length }))

function time(value) { return value ? formatDateTime(value) : '—' }
function pretty(value) { return JSON.stringify(value, null, 2) }
function notify(kind, text, requestId = '') { message.value = { kind, text, requestId } }
function clearSecret() { secret.value = '' }
function showSecret(value, title) { secret.value = value; secretTitle.value = title; secretDialog.value?.showModal() }
async function copy(value) { try { await navigator.clipboard.writeText(value); notify('success', '已复制。') } catch { notify('error', '浏览器不允许复制，请手动选择文本。') } }
async function api(method, path, payload, config = {}) { const response = await http({ method, url: `/api/open-platform/${path}`, ...(payload === undefined ? {} : { data: payload }), ...config }); return response.data?.data }
async function act(action, success = '') {
  if (acting.value) return
  acting.value = true; message.value = null
  try { await action(); if (success) notify('success', success) }
  catch (error) {
    const info = apiError(error)
    if (info.code === 'step_up_required') { pendingAction = () => act(action, success); verification.value = { password: '', totp: '' }; verificationDialog.value?.showModal() }
    else notify('error', info.message, info.requestId)
  } finally { acting.value = false }
}
async function verify() {
  await act(async () => {
    await api('POST', 'step-up', verification.value)
    verification.value = { password: '', totp: '' }; verificationDialog.value?.close()
    const action = pendingAction; pendingAction = null
    if (action) window.setTimeout(action, 0)
  })
}
function cancelVerification() { verification.value = { password: '', totp: '' }; pendingAction = null }
async function loadApplications() { applications.value = (await api('GET', 'apps'))?.items || [] }
async function loadApp(id, refreshDraft = true) {
  if (!id) return
  const result = await api('GET', `apps/${id}`)
  selected.value = id; details.value = result
  if (refreshDraft) { policyDraft.value = structuredClone(result.application.status === 'pending' ? result.application.requested_policy : result.application.policy); metadataDraft.value = { name: result.application.name, purpose: result.application.purpose } }
  if (!activeCredentials.value.some(k => k.id === credentialId.value)) credentialId.value = activeCredentials.value[0]?.id || ''
  const [u, l, j] = await Promise.all([api('GET', 'usage', undefined, { params: { client_id: id } }), api('GET', 'logs', undefined, { params: { client_id: id } }), api('GET', 'jobs', undefined, { params: { client_id: id } })])
  usage.value = u?.items || []; calls.value = l?.items || []; applicationJobs.value = j?.items || []
}
async function selectApp(id) {
  loading.value = true
  try { await loadApp(id); await router.replace({ path: route.path, query: { ...route.query, app: id } }) }
  catch (error) { const info = apiError(error); notify('error', info.message, info.requestId) }
  finally { loading.value = false }
}
async function loadSection(after = null) {
  if (!initialized.value) return
  loading.value = true
  try {
    if (section.value === 'overview') overview.value = await api('GET', 'overview') || {}
    else if (section.value === 'apps') { await loadApplications(); if (route.query.app) await loadApp(String(route.query.app)); }
    else if (section.value === 'catalog') { if (route.query.app && selected.value !== route.query.app) await loadApp(String(route.query.app)); }
    else if (section.value === 'settings') { settings.value = await api('GET', 'settings'); allowedHostsText.value = (settings.value.document.webhook_allowed_hosts || []).join('\n') }
    else if (section.value === 'roles') roles.value = (await api('GET', 'roles'))?.items || []
    else if (section.value === 'docs') documentText.value = (await api('GET', `documentation/${documentKind.value}`))?.markdown || ''
    else {
      const data = await api('GET', section.value, undefined, { params: { ...(appFilter.value ? { client_id: appFilter.value } : {}), ...(after ? { after } : {}) } })
      rows.value = after ? [...rows.value, ...(data?.items || [])] : data?.items || []; nextAfter.value = data?.next_after || null
    }
  } catch (error) { const info = apiError(error); notify('error', info.message, info.requestId) }
  finally { loading.value = false }
}
function openCreate() {
  createForm.value = { name: '', purpose: '', kind: 'personal', environment: 'production', owner_user_id: '', policy: cloneDocument(catalog.value.default_policy) }
  createDialog.value?.showModal()
}
async function createApplication() {
  await act(async () => {
    const form = { ...createForm.value }; if (form.owner_user_id) form.owner_user_id = Number(form.owner_user_id); else delete form.owner_user_id
    const app = await api('POST', 'apps', form); createDialog.value?.close(); await loadApplications(); await selectApp(app.id)
  }, '应用申请已提交，审批通过后可创建凭据。')
}
async function changeState(status) {
  if (!window.confirm(`确定${status === 'active' ? '启用' : status === 'paused' ? '暂停' : '归档'}“${details.value.application.name}”吗？`)) return
  await act(async () => { await api('POST', `apps/${selected.value}/state`, { status, expected_revision: details.value.application.revision }); await loadApp(selected.value); await loadApplications() }, '应用状态已更新。')
}
async function saveMetadata() {
  await act(async () => { await api('PATCH', `apps/${selected.value}`, { ...metadataDraft.value, expected_revision: details.value.application.revision }); await loadApp(selected.value); await loadApplications() }, '应用信息已保存。')
}
async function savePolicy() {
  await act(async () => { await api('PATCH', `apps/${selected.value}`, { policy: policyDraft.value, expected_revision: details.value.application.revision }); await loadApp(selected.value) }, '授权已发布。旧游标及旧授权生成的文件需要重新生成。')
}
async function requestPolicy() {
  await act(async () => { await api('POST', `apps/${selected.value}/requests`, { policy: policyDraft.value, reason: approvalReason.value }); approvalReason.value = '' }, '权限与配额申请已提交。')
}
function openKey(key = null) {
  keyForm.value = { name: key ? `${key.name}（轮换）` : '', expires_days: 90, ip_allowlist: (key?.ip_allowlist || []).join('\n'), scopes: [...(key?.scopes || details.value.application.policy.scopes || [])], overlap_hours: 0, rotate: key?.id || null }
  keyDialog.value?.showModal()
}
async function issueKey() {
  await act(async () => {
    const { rotate, ...form } = keyForm.value; form.ip_allowlist = form.ip_allowlist.split(/[\n,]+/).map(v => v.trim()).filter(Boolean)
    const result = await api('POST', `apps/${selected.value}/credentials${rotate ? `/${rotate}/rotate` : ''}`, form)
    keyDialog.value?.close(); await loadApp(selected.value, false); showSecret(result.token, rotate ? '新凭据已生成' : '凭据已生成')
  })
}
async function revokeKey(key) {
  if (!window.confirm(`撤销“${key.name}”后，新调用和关联后台任务将失去授权。确定撤销吗？`)) return
  await act(async () => { await api('POST', `apps/${selected.value}/credentials/${key.id}/revoke`, {}); await loadApp(selected.value, false) }, '凭据已撤销。')
}
function review(item) {
  approval.value = item; approvalPolicy.value = cloneDocument(item.requested_policy); approvalNote.value = ''
  approvalDialog.value?.showModal()
}
async function submitReview(approved) {
  await act(async () => { await api('POST', `approvals/${approval.value.id}/review`, { approved, ...(approved ? { policy: approvalPolicy.value } : {}), note: approvalNote.value }); approvalDialog.value?.close(); await loadSection(); await loadApplications() }, approved ? '申请已批准。' : '申请已驳回。')
}
function chooseEndpoint(e) { endpointIndex.value = catalog.value.endpoints.indexOf(e); payloadText.value = pretty(samplePayload(e.path, e.method)); parameterValues.value = {}; invocationResult.value = '' }
async function invoke(method, path, payload = {}, config = {}) {
  if (!selected.value || !credentialId.value) throw new Error('请选择应用和有效凭据。')
  return api('POST', `apps/${selected.value}/invoke`, { credential_id: credentialId.value, method, path, payload }, { headers: { 'Idempotency-Key': crypto.randomUUID() }, ...config })
}
async function runExample() {
  if (!endpoint.value || invocationBusy.value) return
  if (parameters.value.some(k => !parameterValues.value[k])) { notify('error', '请填写路径参数。'); return }
  let payload
  try { payload = JSON.parse(payloadText.value) } catch { notify('error', '请求参数必须为有效 JSON。'); return }
  if (isMutation(endpoint.value.method, endpoint.value.path) && !window.confirm(`执行 ${endpoint.value.summary} 会变更当前应用的业务资源。确定执行吗？`)) return
  invocationBusy.value = true
  try { const result = await invoke(endpoint.value.method, invocationPath.value, payload); invocationResult.value = pretty(result); if (result?.signing_secret) if (result.signing_secret) showSecret(result.signing_secret, '事件签名密钥已生成') }
  catch (error) { const info = apiError(error, error.message); invocationResult.value = pretty({ error: info.message, request_id: info.requestId }); notify('error', info.message, info.requestId) }
  finally { invocationBusy.value = false }
}
async function downloadJob(job) {
  await act(async () => {
    if (selected.value !== job.client_id) await loadApp(job.client_id)
    const path = job.kind === 'report' ? `/reports/${job.id}/artifacts/json` : `/exports/${job.id}/download`
    const response = await http.post(`/api/open-platform/apps/${selected.value}/invoke`, { credential_id: credentialId.value, method: 'GET', path, payload: {} }, { responseType: 'blob' })
    const url = URL.createObjectURL(response.data), link = document.createElement('a'); link.href = url
    link.download = response.headers['content-disposition']?.match(/filename="([^"]+)"/)?.[1] || `${job.kind}-${job.id}.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
}
async function jobAction(job, action) {
  if (!window.confirm(action === 'cancel' ? '确定取消此导出任务吗？' : '确定删除此导出生成物吗？')) return
  await act(async () => { if (selected.value !== job.client_id) await loadApp(job.client_id); await invoke(action === 'cancel' ? 'POST' : 'DELETE', `/exports/${job.id}${action === 'cancel' ? '/cancel' : ''}`); await loadApp(selected.value, false); if (section.value === 'jobs') await loadSection() }, '导出已更新。')
}
async function retryDelivery(item) {
  if (!window.confirm('确定重新投递此事件吗？接收方需要按事件 ID 去重。')) return
  await act(async () => { if (selected.value !== item.client_id) await loadApp(item.client_id); await invoke('POST', `/webhook-deliveries/${item.id}/retry`); await loadSection() }, '投递已重新入队。')
}
async function loadSubscriptions() { await act(async () => { subscriptions.value = (await invoke('GET', '/webhooks'))?.items || [] }) }
function editWebhook(hook) { webhookForm.value = { id: hook.id, url: hook.url, event_types: cloneDocument(hook.event_types), enabled: hook.enabled }; webhookDialog.value?.showModal() }
function newWebhook() { webhookForm.value = { url: '', event_types: [], enabled: true }; webhookDialog.value?.showModal() }
async function createWebhook() { await act(async () => { const { id, ...payload } = webhookForm.value; const result = await invoke(id ? 'PATCH' : 'POST', id ? `/webhooks/${id}` : '/webhooks', payload); webhookDialog.value?.close(); subscriptions.value = (await invoke('GET', '/webhooks'))?.items || []; if (result.signing_secret) showSecret(result.signing_secret, '事件签名密钥已生成') }) }
async function webhookAction(hook, action) { if (action === 'delete' && !window.confirm('确定停用此事件订阅吗？')) return; await act(async () => { await invoke(action === 'delete' ? 'DELETE' : 'POST', `/webhooks/${hook.id}${action === 'test' ? '/test' : ''}`); subscriptions.value = (await invoke('GET', '/webhooks'))?.items || [] }, action === 'test' ? '测试事件已入队。' : '订阅已停用。') }
async function saveSettings() { await act(async () => { settings.value.document.webhook_allowed_hosts = allowedHostsText.value.split(/[\n,]+/).map(v => v.trim()).filter(Boolean); await api('PUT', 'settings', { document: settings.value.document, expected_revision: settings.value.revision }); await loadSection() }, '平台设置已发布。') }
async function saveRole() { await act(async () => { await api('PUT', `roles/${Number(roleForm.value.user_id)}`, { role: roleForm.value.role }); await loadSection() }, '开放平台管理权限已更新。') }
async function exportOpenApi() { const response = await http.get('/api/open-platform/openapi.json'); const url = URL.createObjectURL(new Blob([pretty(response.data)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'network-mapping-openapi.json'; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) }

watch(section, () => { textFilter.value = ''; rows.value = []; loadSection() })
watch(appTab, () => { if (appTab.value === 'webhooks' && canInvoke.value) loadSubscriptions() })
watch(documentKind, () => { if (section.value === 'docs') loadSection() })
onMounted(async () => {
  try { const [s, c] = await Promise.all([api('GET', 'session'), api('GET', 'catalog')]); role.value = s.role; catalog.value = c; await loadApplications(); initialized.value = true; await loadSection() }
  catch (error) { const info = apiError(error); notify('error', info.message, info.requestId) }
  timer = window.setInterval(() => { clock.value = Date.now(); if (!document.hidden && !loading.value && !acting.value && ['overview', 'jobs', 'deliveries'].includes(section.value)) loadSection() }, 30000)
})
onBeforeUnmount(() => { if (timer) window.clearInterval(timer); clearSecret(); cancelVerification() })
</script>

<template>
  <main class="mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:p-6">
    <div class="flex flex-wrap items-center justify-between gap-3"><div><h1 class="text-2xl font-semibold">开放平台</h1><p class="mt-1 text-sm opacity-60">管理应用接入、授权范围和业务自动化。</p></div><div class="flex items-center gap-2"><span class="badge badge-outline">{{ { admin: '平台管理员', operator: '运营人员', auditor: '审计人员', developer: '开发者' }[role] }}</span><button class="btn btn-sm btn-ghost" :disabled="loading" @click="loadSection()">刷新</button></div></div>
    <div v-if="message" role="alert" class="alert" :class="message.kind === 'error' ? 'alert-error' : 'alert-success'"><div><p>{{ message.text }}</p><p v-if="message.requestId" class="mt-1 font-mono text-xs">请求 ID：{{ message.requestId }}</p></div><button class="btn btn-ghost btn-xs" aria-label="关闭提示" @click="message = null">关闭</button></div>
    <nav class="flex flex-wrap gap-1 rounded-xl bg-base-100 p-2"><router-link v-for="[id, label] in nav" :key="id" :to="{ path: id === 'overview' ? '/open-platform' : `/open-platform/${id}`, query: selected ? { app: selected } : {} }" class="btn btn-sm" :class="section === id ? 'btn-primary' : 'btn-ghost'">{{ label }}</router-link></nav>
    <div v-if="loading" class="flex items-center gap-2 text-sm opacity-60"><span class="loading loading-spinner loading-xs" />正在加载…</div>
    <div v-if="!initialized && !loading" class="rounded-xl bg-base-100 p-6"><p>开放平台暂时无法加载。</p><button class="btn btn-sm mt-3" @click="router.go(0)">重新加载</button></div>

    <template v-if="section === 'overview' && initialized">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><div v-for="[key, label] in [['applications', '应用总数'], ['active', '已启用'], ['pending', '待审批'], ['calls', '近 24 小时调用'], ['errors', '近 24 小时错误']]" :key="key" class="rounded-xl border border-base-300 bg-base-100 p-5"><p class="text-sm opacity-60">{{ label }}</p><p class="mt-2 text-3xl font-semibold">{{ Number(overview[key] || 0).toLocaleString() }}</p></div></div>
      <div class="grid gap-4 lg:grid-cols-2"><div class="rounded-xl bg-base-100 p-6"><h2 class="font-semibold">接入流程</h2><ol class="mt-4 list-decimal space-y-3 pl-5 text-sm"><li>申请应用，填写用途、功能和数据范围。</li><li>审批通过后创建独立凭据，保存一次性显示的密钥。</li><li>从接口目录选择功能，验证返回数据和配额。</li><li>通过调用日志、请求 ID 和事件投递排查问题。</li></ol><router-link class="btn btn-primary btn-sm mt-5" to="/open-platform/apps">管理我的应用</router-link></div><div class="rounded-xl bg-base-100 p-6"><h2 class="font-semibold">运行情况</h2><p class="mt-4 text-sm opacity-70">近 24 小时 P95 请求耗时</p><p class="mt-2 text-3xl font-semibold">{{ Number(overview.p95_ms || 0).toFixed(1) }} <span class="text-base opacity-60">ms</span></p><p class="mt-5 text-sm opacity-60">同一应用的所有凭据共享额度。查询不会自动创建扫描；扫描需单独授权。</p></div></div>
    </template>

    <template v-if="section === 'apps' && initialized">
      <div class="flex flex-wrap items-center justify-between gap-3"><div class="flex items-center gap-2"><input v-model="textFilter" class="input input-bordered input-sm" placeholder="搜索应用或用途" /><span class="text-xs opacity-60">{{ appStats.active }} 个启用 · {{ appStats.pending }} 个待审批</span></div><button v-if="!isAuditor" class="btn btn-primary btn-sm" @click="openCreate">申请应用</button></div>
      <div class="overflow-x-auto rounded-xl bg-base-100"><table class="table"><thead><tr><th>应用</th><th>类型</th><th>环境</th><th>状态</th><th>数据范围</th><th>更新</th><th /></tr></thead><tbody><tr v-for="app in filteredApplications" :key="app.id" :class="selected === app.id ? 'bg-primary/5' : ''"><td><div class="font-medium">{{ app.name }}</div><div class="max-w-xs truncate text-xs opacity-60">{{ app.purpose }}</div></td><td>{{ app.kind === 'partner' ? '合作方' : '个人工具' }}</td><td>{{ app.environment === 'sandbox' ? '沙箱' : '生产' }}</td><td><span class="badge badge-sm" :class="applicationStatus(app.status)[1]">{{ applicationStatus(app.status)[0] }}</span></td><td>{{ app.policy.data_mode === 'owner' ? '责任用户数据' : '应用任务数据' }}</td><td class="text-xs">{{ time(app.updated_at) }}</td><td><button class="btn btn-sm btn-ghost" @click="selectApp(app.id)">详情</button></td></tr></tbody></table><div v-if="!applications.length && !loading" class="p-8 text-center text-sm opacity-60">暂无应用。申请应用后即可开始接入。</div></div>
      <div v-if="details" class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3"><div><h2 class="text-xl font-semibold">{{ details.application.name }}</h2><p class="mt-1 font-mono text-xs opacity-60">{{ details.application.id }}</p></div><div v-if="!isAuditor" class="flex gap-2"><button v-if="isAdmin && details.application.status === 'paused'" class="btn btn-sm" :disabled="acting" @click="changeState('active')">启用</button><button v-if="details.application.status === 'active'" class="btn btn-sm" :disabled="acting" @click="changeState('paused')">暂停</button><button v-if="details.application.status !== 'archived'" class="btn btn-sm btn-outline btn-error" :disabled="acting" @click="changeState('archived')">归档</button></div></div>
        <div class="tabs tabs-border my-4 overflow-x-auto"><button v-for="[id, label] in [['overview', '概览'], ['policy', '授权与配额'], ['keys', '凭据'], ['usage', '用量与调用'], ['jobs', '导出与报告'], ['webhooks', '事件订阅']]" :key="id" class="tab whitespace-nowrap" :class="appTab === id ? 'tab-active' : ''" @click="appTab = id">{{ label }}</button></div>
        <div v-if="appTab === 'overview'" class="space-y-4"><p class="text-sm">{{ details.application.purpose }}</p><div class="grid gap-3 sm:grid-cols-3"><div><span class="text-xs opacity-60">状态</span><p>{{ applicationStatus(details.application.status)[0] }}</p></div><div><span class="text-xs opacity-60">授权版本</span><p>{{ details.application.policy_revision }}</p></div><div><span class="text-xs opacity-60">到期</span><p>{{ time(details.application.expires_at) }}</p></div></div><div v-if="!isAuditor" class="grid gap-3 sm:grid-cols-2"><label class="form-control"><span class="label-text mb-1">名称</span><input v-model="metadataDraft.name" class="input input-bordered" maxlength="100" /></label><label class="form-control"><span class="label-text mb-1">用途</span><input v-model="metadataDraft.purpose" class="input input-bordered" maxlength="2000" /></label><button class="btn btn-sm w-fit" :disabled="acting" @click="saveMetadata">保存信息</button></div><p v-if="details.application.environment === 'sandbox'" class="text-sm text-warning">沙箱凭据可查询已批准的数据，但不能提交真实扫描；该环境不生成模拟资产。</p></div>
        <div v-if="appTab === 'policy' && policyDraft" class="space-y-4"><OpenApiPolicyEditor v-model="policyDraft" :catalog="catalog" :disabled="isAuditor" /><div v-if="policyChanges.length" class="overflow-x-auto"><table class="table table-xs"><thead><tr><th>变更项</th><th>现有值</th><th>拟发布值</th></tr></thead><tbody><tr v-for="change in policyChanges" :key="change.key"><td>{{ change.key }}</td><td class="max-w-xs break-words">{{ pretty(change.before) }}</td><td class="max-w-xs break-words">{{ pretty(change.after) }}</td></tr></tbody></table></div><button v-if="isAdmin && details.application.status !== 'pending'" class="btn btn-primary btn-sm" :disabled="acting" @click="savePolicy">发布授权</button><div v-else-if="!isAuditor" class="flex flex-wrap gap-3"><input v-model="approvalReason" class="input input-bordered input-sm flex-1" placeholder="说明权限或配额调整用途" maxlength="2000" /><button class="btn btn-primary btn-sm" :disabled="acting || !approvalReason.trim()" @click="requestPolicy">提交审批</button></div></div>
        <div v-if="appTab === 'keys'"><div class="mb-4 flex justify-between"><p class="text-sm opacity-60">密钥只在生成时显示。应用暂停、到期或凭据撤销后，新调用将被拒绝。</p><button v-if="!isAuditor" class="btn btn-primary btn-sm" :disabled="details.application.status !== 'active'" @click="openKey()">创建凭据</button></div><div class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>名称</th><th>状态</th><th>到期</th><th>最近调用</th><th>权限</th><th /></tr></thead><tbody><tr v-for="key in details.credentials" :key="key.id"><td>{{ key.name }}<p class="font-mono text-[10px] opacity-50">{{ key.id }}</p></td><td>{{ key.revoked_at ? '已撤销' : new Date(key.expires_at).getTime() < clock ? '已过期' : '有效' }}</td><td class="text-xs">{{ time(key.expires_at) }}</td><td class="text-xs">{{ time(key.last_used_at) }}</td><td class="max-w-xs break-words text-xs">{{ key.scopes.join(', ') }}</td><td><div v-if="!isAuditor && !key.revoked_at" class="flex gap-1"><button class="btn btn-xs" @click="openKey(key)">轮换</button><button class="btn btn-xs btn-ghost text-error" @click="revokeKey(key)">撤销</button></div></td></tr></tbody></table><p v-if="!details.credentials.length" class="p-5 text-center text-sm opacity-60">暂无凭据。</p></div></div>
        <div v-if="appTab === 'usage'" class="space-y-4"><h3 class="text-sm font-semibold">配额消耗</h3><div class="max-h-72 overflow-auto"><table class="table table-sm"><thead><tr><th>类别</th><th>周期起点</th><th>已用额度</th></tr></thead><tbody><tr v-for="(item, index) in usage" :key="index"><td class="font-mono text-xs">{{ item.category }}</td><td>{{ time(item.bucket_start) }}</td><td>{{ item.units }}</td></tr></tbody></table></div><h3 class="text-sm font-semibold">最近调用</h3><div class="max-h-72 overflow-auto"><table class="table table-xs"><thead><tr><th>接口</th><th>状态</th><th>耗时</th><th>原因</th><th>请求 ID</th></tr></thead><tbody><tr v-for="item in calls" :key="item.id"><td class="font-mono">{{ item.method }} {{ item.route }}</td><td>{{ item.status }}</td><td>{{ item.duration_ms }} ms</td><td>{{ item.reason_code || '—' }}</td><td class="font-mono">{{ item.request_id }}</td></tr></tbody></table></div></div>
        <div v-if="appTab === 'jobs'" class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>类型</th><th>任务</th><th>状态</th><th>到期</th><th /></tr></thead><tbody><tr v-for="job in applicationJobs" :key="job.id"><td>{{ job.kind === 'report' ? '报告' : '导出' }}</td><td class="font-mono text-xs">{{ job.id }}</td><td>{{ job.status }}</td><td>{{ time(job.expires_at) }}</td><td><button v-if="job.status === 'succeeded' && !isAuditor" class="btn btn-xs" :disabled="!activeCredentials.length" @click="downloadJob(job)">下载</button><button v-if="job.kind === 'export' && ['queued', 'running'].includes(job.status) && !isAuditor" class="btn btn-xs ml-1" :disabled="acting" @click="jobAction(job, 'cancel')">取消</button><button v-if="job.kind === 'export' && job.status !== 'deleted' && !isAuditor" class="btn btn-xs btn-ghost text-error ml-1" :disabled="acting" @click="jobAction(job, 'delete')">删除生成物</button></td></tr></tbody></table><p v-if="!applicationJobs.length" class="p-5 text-center text-sm opacity-60">暂无导出或报告。从接口调试可提交生成请求。</p></div>
        <div v-if="appTab === 'webhooks'" class="space-y-4"><div class="flex flex-wrap items-center gap-2"><select v-model="credentialId" class="select select-bordered select-sm"><option v-for="key in activeCredentials" :key="key.id" :value="key.id">{{ key.name }}</option></select><button class="btn btn-sm" :disabled="!canInvoke" @click="loadSubscriptions">刷新订阅</button><button class="btn btn-primary btn-sm" :disabled="!canInvoke || !scopeSet.has('webhooks:manage')" @click="newWebhook">创建订阅</button></div><div class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>回调地址</th><th>事件</th><th>状态</th><th /></tr></thead><tbody><tr v-for="hook in subscriptions" :key="hook.id"><td class="max-w-xs break-all">{{ hook.url }}</td><td class="text-xs">{{ hook.event_types.join(', ') }}</td><td>{{ hook.enabled ? '启用' : '暂停' }}</td><td><div class="flex gap-1"><button class="btn btn-xs" :disabled="acting || !canInvoke" @click="editWebhook(hook)">编辑</button><button class="btn btn-xs" :disabled="acting || !canInvoke || !hook.enabled" @click="webhookAction(hook, 'test')">测试</button><button class="btn btn-xs btn-ghost text-error" @click="webhookAction(hook, 'delete')">停用</button></div></td></tr></tbody></table><p v-if="!subscriptions.length" class="p-5 text-center text-sm opacity-60">暂无订阅；需批准事件权限及回调域名。</p></div></div>
      </div>
    </template>

    <template v-if="section === 'catalog' && initialized">
      <div class="flex flex-wrap justify-between gap-3"><input v-model="textFilter" class="input input-bordered input-sm" placeholder="搜索路径、功能或权限" /><button class="btn btn-sm" @click="exportOpenApi">下载 OpenAPI 契约</button></div>
      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div class="max-h-[75vh] overflow-auto rounded-xl bg-base-100"><table class="table table-sm"><thead><tr><th>方法</th><th>接口与功能</th><th>权限</th></tr></thead><tbody><tr v-for="item in filteredEndpoints" :key="`${item.method}:${item.path}`" class="cursor-pointer hover:bg-base-200" @click="chooseEndpoint(item)"><td><span class="badge badge-sm badge-outline">{{ item.method }}</span></td><td><p class="font-mono text-xs">{{ item.path }}</p><p class="mt-1 text-xs opacity-60">{{ item.summary }}</p></td><td class="text-xs">{{ item.scope }}</td></tr></tbody></table></div><div class="space-y-4 rounded-xl bg-base-100 p-5"><h2 class="font-semibold">{{ endpoint?.summary || '选择接口' }}</h2><div class="grid gap-3 sm:grid-cols-2"><label class="form-control"><span class="label-text mb-1">应用</span><select :value="selected || ''" class="select select-bordered select-sm" @change="selectApp($event.target.value)"><option value="" disabled>请选择</option><option v-for="app in applications" :key="app.id" :value="app.id">{{ app.name }}</option></select></label><label class="form-control"><span class="label-text mb-1">凭据</span><select v-model="credentialId" class="select select-bordered select-sm"><option value="" disabled>请选择</option><option v-for="key in activeCredentials" :key="key.id" :value="key.id">{{ key.name }}</option></select></label></div><label v-for="key in parameters" :key="key" class="form-control"><span class="label-text mb-1">{{ key }}</span><input v-model="parameterValues[key]" class="input input-bordered input-sm" /></label><label class="form-control"><span class="label-text mb-1">请求参数 {{ endpoint?.method === 'GET' ? '（查询参数）' : '' }}</span><textarea v-model="payloadText" class="textarea textarea-bordered min-h-40 font-mono text-xs" spellcheck="false" /></label><div class="flex gap-2"><button class="btn btn-primary btn-sm" :disabled="!canInvoke || invocationBusy" @click="runExample">{{ invocationBusy ? '调用中…' : '执行调用' }}</button><button class="btn btn-sm btn-ghost" @click="copy(codeExample)">复制 cURL</button></div><p class="text-xs opacity-60">调试使用当前登录会话和所选凭据的授权，不读取凭据密钥。写操作会产生真实业务变更。</p><pre class="max-h-48 overflow-auto rounded-lg bg-base-200 p-3 text-xs">{{ codeExample }}</pre><pre v-if="invocationResult" class="max-h-80 overflow-auto rounded-lg bg-base-200 p-3 text-xs">{{ invocationResult }}</pre></div></div>
    </template>

    <template v-if="section === 'approvals' && initialized"><div class="overflow-x-auto rounded-xl bg-base-100"><table class="table"><thead><tr><th>应用</th><th>申请原因</th><th>状态</th><th>提交时间</th><th>意见</th><th /></tr></thead><tbody><tr v-for="item in rows" :key="item.id"><td>{{ item.name }}</td><td class="max-w-sm break-words">{{ item.reason }}</td><td>{{ { pending: '待审核', approved: '已批准', rejected: '已驳回' }[item.status] }}</td><td class="text-xs">{{ time(item.created_at) }}</td><td>{{ item.review_note || '—' }}</td><td><button class="btn btn-sm" @click="review(item)">{{ isAdmin && item.status === 'pending' ? '审核' : '详情' }}</button></td></tr></tbody></table><div v-if="!rows.length && !loading" class="p-8 text-center opacity-60">暂无申请。</div></div></template>

    <template v-if="['logs', 'audit', 'jobs', 'deliveries'].includes(section) && initialized">
      <div class="flex gap-2"><select v-model="appFilter" class="select select-bordered select-sm" @change="loadSection()"><option value="">全部可见应用</option><option v-for="app in applications" :key="app.id" :value="app.id">{{ app.name }}</option></select><span class="self-center text-xs opacity-60">{{ section === 'logs' || section === 'audit' ? '每页 100 条，可继续加载' : '最近 100 条' }}</span></div>
      <div class="overflow-x-auto rounded-xl bg-base-100"><table v-if="section === 'logs'" class="table table-sm"><thead><tr><th>时间</th><th>接口</th><th>状态</th><th>耗时</th><th>原因</th><th>请求 ID</th></tr></thead><tbody><tr v-for="item in rows" :key="item.id"><td class="text-xs">{{ time(item.created_at) }}</td><td class="font-mono text-xs">{{ item.method }} {{ item.route }}</td><td :class="item.status >= 400 ? 'text-error' : ''">{{ item.status }}</td><td>{{ item.duration_ms }} ms</td><td>{{ item.reason_code || '—' }}</td><td class="font-mono text-xs">{{ item.request_id }}</td></tr></tbody></table><table v-if="section === 'audit'" class="table table-sm"><thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>资源</th><th>变更</th><th>请求 ID</th></tr></thead><tbody><tr v-for="item in rows" :key="item.id"><td class="text-xs">{{ time(item.created_at) }}</td><td>{{ item.actor_type }} / {{ item.actor_id }}</td><td class="font-mono text-xs">{{ item.action }}</td><td class="max-w-xs break-all text-xs">{{ item.resource_id }}</td><td><details><summary class="cursor-pointer">查看</summary><pre class="max-h-60 max-w-lg overflow-auto text-xs">{{ pretty(item.changes) }}</pre></details></td><td class="font-mono text-xs">{{ item.request_id }}</td></tr></tbody></table><table v-if="section === 'jobs'" class="table table-sm"><thead><tr><th>类型</th><th>任务</th><th>状态</th><th>创建时间</th><th>失败原因</th><th /></tr></thead><tbody><tr v-for="item in rows" :key="item.id"><td>{{ item.kind === 'report' ? '报告' : '导出' }}</td><td class="font-mono text-xs">{{ item.id }}</td><td>{{ item.status }}</td><td class="text-xs">{{ time(item.created_at) }}</td><td>{{ item.last_error || '—' }}</td><td><button v-if="item.status === 'succeeded' && !isAuditor" class="btn btn-xs" @click="downloadJob(item)">下载</button><button v-if="item.kind === 'export' && ['queued', 'running'].includes(item.status) && !isAuditor" class="btn btn-xs ml-1" :disabled="acting" @click="jobAction(item, 'cancel')">取消</button><button v-if="item.kind === 'export' && item.status !== 'deleted' && !isAuditor" class="btn btn-xs btn-ghost text-error ml-1" :disabled="acting" @click="jobAction(item, 'delete')">删除生成物</button></td></tr></tbody></table><table v-if="section === 'deliveries'" class="table table-sm"><thead><tr><th>投递</th><th>状态</th><th>尝试次数</th><th>接收状态码</th><th>原因</th><th>时间</th><th /></tr></thead><tbody><tr v-for="item in rows" :key="item.id"><td class="font-mono text-xs">{{ item.id }}</td><td>{{ item.status }}</td><td>{{ item.attempt_count }}</td><td>{{ item.response_status || '—' }}</td><td>{{ item.last_error || '—' }}</td><td class="text-xs">{{ time(item.created_at) }}</td><td><button v-if="item.status === 'failed' && !isAuditor" class="btn btn-xs" :disabled="acting" @click="retryDelivery(item)">重试</button></td></tr></tbody></table><div v-if="!rows.length && !loading" class="p-8 text-center text-sm opacity-60">暂无记录。</div><button v-if="nextAfter && ['logs', 'audit'].includes(section)" class="btn btn-sm btn-ghost m-3" :disabled="loading" @click="loadSection(nextAfter)">继续加载</button></div>
    </template>

    <template v-if="section === 'settings' && isAdmin"><form class="max-w-3xl space-y-5 rounded-xl bg-base-100 p-6" @submit.prevent="saveSettings"><label class="flex items-center gap-3"><input v-model="settings.document.enabled" type="checkbox" class="toggle toggle-primary" /><span>启用外部 API</span></label><p class="text-sm opacity-60">关闭后拒绝新调用；后台任务重新检查授权，已下发扫描通过取消协议停止。</p><div class="grid gap-4 sm:grid-cols-2"><label class="form-control"><span class="label-text mb-1">调用日志保留天数</span><input v-model.number="settings.document.retention_days" type="number" min="1" max="90" class="input input-bordered" /></label><label class="form-control"><span class="label-text mb-1">审计保留天数</span><input v-model.number="settings.document.audit_retention_days" type="number" min="30" max="730" class="input input-bordered" /></label></div><label class="form-control"><span class="label-text mb-1">批准的 Webhook 域名</span><textarea v-model="allowedHostsText" class="textarea textarea-bordered" rows="5" placeholder="hooks.partner.example.com" /><span class="mt-1 text-xs opacity-60">每行一个明确域名。仅 HTTPS 443，禁止重定向和私网地址。</span></label><button class="btn btn-primary btn-sm" :disabled="acting">发布设置</button></form></template>
    <template v-if="section === 'roles' && isAdmin"><div class="space-y-5 rounded-xl bg-base-100 p-6"><form class="flex flex-wrap items-end gap-3" @submit.prevent="saveRole"><label class="form-control"><span class="label-text mb-1">现有用户 ID</span><input v-model="roleForm.user_id" type="number" min="1" required class="input input-bordered input-sm" /></label><label class="form-control"><span class="label-text mb-1">开放平台权限</span><select v-model="roleForm.role" class="select select-bordered select-sm"><option value="operator">运营人员</option><option value="auditor">审计人员</option><option value="developer">开发者（移除额外权限）</option></select></label><button class="btn btn-primary btn-sm" :disabled="acting">保存</button></form><p class="text-sm opacity-60">平台管理员沿用原管理员角色。此操作只调整开放平台权限。</p><table class="table table-sm"><thead><tr><th>用户</th><th>ID</th><th>开放平台角色</th></tr></thead><tbody><tr v-for="item in roles" :key="item.user_id"><td>{{ item.username }}</td><td>{{ item.user_id }}</td><td>{{ item.role }}</td></tr></tbody></table></div></template>
    <template v-if="section === 'docs'"><div class="flex flex-wrap gap-2"><button v-for="[kind, label] in [['integration', '外部接入'], ['management', '管理与运维'], ['implementation', '实现与验证']]" :key="kind" class="btn btn-sm" :class="documentKind === kind ? 'btn-primary' : 'btn-ghost'" @click="documentKind = kind">{{ label }}</button><button class="btn btn-sm" @click="exportOpenApi">下载接口契约</button></div><pre class="max-h-[75vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-base-100 p-5 text-sm leading-7">{{ documentText || '正在加载文档…' }}</pre></template>

    <dialog ref="createDialog" class="modal"><form class="modal-box max-w-5xl space-y-4" @submit.prevent="createApplication"><h2 class="text-xl font-semibold">申请应用</h2><div class="grid gap-3 sm:grid-cols-2"><label class="form-control"><span class="label-text mb-1">应用名称</span><input v-model="createForm.name" required maxlength="100" class="input input-bordered" /></label><label class="form-control"><span class="label-text mb-1">用途</span><input v-model="createForm.purpose" required maxlength="2000" class="input input-bordered" /></label><label v-if="isAdmin" class="form-control"><span class="label-text mb-1">应用类型</span><select v-model="createForm.kind" class="select select-bordered"><option value="personal">个人工具</option><option value="partner">合作方系统</option></select></label><label class="form-control"><span class="label-text mb-1">环境</span><select v-model="createForm.environment" class="select select-bordered"><option value="production">生产</option><option value="sandbox">沙箱（禁止真实扫描）</option></select></label><label v-if="isAdmin" class="form-control"><span class="label-text mb-1">责任用户 ID（留空为本人）</span><input v-model="createForm.owner_user_id" type="number" min="1" class="input input-bordered" /></label></div><OpenApiPolicyEditor v-model="createForm.policy" :catalog="catalog" /><div class="modal-action"><button type="button" class="btn btn-sm" @click="createDialog.close()">取消</button><button class="btn btn-primary btn-sm" :disabled="acting">提交申请</button></div></form><form method="dialog" class="modal-backdrop"><button>关闭</button></form></dialog>
    <dialog ref="keyDialog" class="modal"><form class="modal-box max-w-2xl space-y-4" @submit.prevent="issueKey"><h2 class="text-xl font-semibold">{{ keyForm.rotate ? '轮换凭据' : '创建凭据' }}</h2><label class="form-control"><span class="label-text mb-1">名称</span><input v-model="keyForm.name" class="input input-bordered" required maxlength="100" /></label><div class="grid gap-3 sm:grid-cols-2"><label class="form-control"><span class="label-text mb-1">有效天数</span><input v-model.number="keyForm.expires_days" type="number" min="1" max="365" required class="input input-bordered" /></label><label v-if="keyForm.rotate" class="form-control"><span class="label-text mb-1">旧凭据重叠小时数</span><input v-model.number="keyForm.overlap_hours" type="number" min="0" max="24" class="input input-bordered" /></label></div><label class="form-control"><span class="label-text mb-1">来源 CIDR</span><textarea v-model="keyForm.ip_allowlist" class="textarea textarea-bordered" rows="3" /></label><div class="grid gap-2 sm:grid-cols-2"><label v-for="scope in details?.application?.policy?.scopes || []" :key="scope" class="flex items-center gap-2 text-xs"><input v-model="keyForm.scopes" :value="scope" type="checkbox" class="checkbox checkbox-sm" />{{ scope }}</label></div><div class="modal-action"><button type="button" class="btn btn-sm" @click="keyDialog.close()">取消</button><button class="btn btn-primary btn-sm" :disabled="acting">生成凭据</button></div></form><form method="dialog" class="modal-backdrop"><button>关闭</button></form></dialog>
    <dialog ref="secretDialog" class="modal" @close="clearSecret"><div class="modal-box max-w-2xl"><h2 class="text-xl font-semibold">{{ secretTitle }}</h2><p class="my-4 text-sm">请保存到调用方的密钥管理系统。关闭后无法再次查看。</p><textarea :value="secret" readonly class="textarea textarea-bordered w-full break-all font-mono text-xs" rows="4" aria-label="一次性密钥" /><div class="modal-action"><button class="btn btn-sm" @click="copy(secret)">复制</button><button class="btn btn-primary btn-sm" @click="secretDialog.close()">已保存，关闭</button></div></div></dialog>
    <dialog ref="verificationDialog" class="modal" @close="cancelVerification"><form class="modal-box space-y-4" @submit.prevent="verify"><h2 class="text-xl font-semibold">验证身份</h2><p class="text-sm opacity-60">凭据和授权变更需要重新验证。验证有效期为 5 分钟。</p><label class="form-control"><span class="label-text mb-1">当前密码</span><input v-model="verification.password" type="password" autocomplete="current-password" required class="input input-bordered" /></label><label class="form-control"><span class="label-text mb-1">2FA 验证码（已启用时必填）</span><input v-model="verification.totp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" class="input input-bordered" /></label><div class="modal-action"><button type="button" class="btn btn-sm" @click="verificationDialog.close()">取消</button><button class="btn btn-primary btn-sm" :disabled="acting">验证并继续</button></div></form></dialog>
    <dialog ref="approvalDialog" class="modal"><div class="modal-box max-w-5xl space-y-4"><h2 class="text-xl font-semibold">{{ approval?.name }} · 申请详情</h2><p class="text-sm">{{ approval?.reason }}</p><OpenApiPolicyEditor v-if="approvalPolicy" v-model="approvalPolicy" :catalog="catalog" :disabled="!isAdmin || approval?.status !== 'pending'" /><label v-if="isAdmin && approval?.status === 'pending'" class="form-control"><span class="label-text mb-1">审批意见</span><textarea v-model="approvalNote" class="textarea textarea-bordered" maxlength="2000" /></label><div class="modal-action"><button class="btn btn-sm" @click="approvalDialog.close()">关闭</button><template v-if="isAdmin && approval?.status === 'pending'"><button class="btn btn-sm btn-outline btn-error" :disabled="acting" @click="submitReview(false)">驳回</button><button class="btn btn-primary btn-sm" :disabled="acting" @click="submitReview(true)">批准并发布授权</button></template></div></div><form method="dialog" class="modal-backdrop"><button>关闭</button></form></dialog>
    <dialog ref="webhookDialog" class="modal"><form class="modal-box space-y-4" @submit.prevent="createWebhook"><h2 class="text-xl font-semibold">{{ webhookForm.id ? '编辑事件订阅' : '创建事件订阅' }}</h2><label class="form-control"><span class="label-text mb-1">回调 HTTPS 地址</span><input v-model="webhookForm.url" type="url" required class="input input-bordered" placeholder="https://hooks.example.com/network-events" /></label><div class="grid gap-2"><label v-for="kind in catalog.event_types || []" :key="kind" class="flex items-center gap-2 text-sm"><input v-model="webhookForm.event_types" :value="kind" type="checkbox" class="checkbox checkbox-sm" />{{ kind }}</label></div><label class="flex items-center gap-2 text-sm"><input v-model="webhookForm.enabled" type="checkbox" class="toggle toggle-sm" />启用投递</label><div class="modal-action"><button type="button" class="btn btn-sm" @click="webhookDialog.close()">取消</button><button class="btn btn-primary btn-sm" :disabled="acting">{{ webhookForm.id ? '保存订阅' : '创建订阅' }}</button></div></form><form method="dialog" class="modal-backdrop"><button>关闭</button></form></dialog>
  </main>
</template>
