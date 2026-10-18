<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DOMPurify from 'dompurify'
import http from '@/utils/http'
import { notificationEvents, providerLabel } from '@/utils/notifications'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { formatDateTime } from '@/utils/systemTime'

const props = defineProps({ provider: { type: String, required: true } })
const event = ref(notificationEvents[0].value)
const detail = ref(null)
const source = ref({format:'text',titleTemplate:'',bodyTemplate:''})
const saved = ref(JSON.stringify(source.value))
const loading = ref(false)
const busy = ref(false)
const previewing = ref(false)
const preview = ref(null)
const previewTab = ref('rendered')
const previewError = ref('')
const error = ref('')
const notice = ref('')
const hasUnsavedChanges = computed(() => saved.value !== JSON.stringify(source.value))
useUnsavedChanges(hasUnsavedChanges, async () => { await act('draft'); return !hasUnsavedChanges.value })
defineExpose({ hasUnsavedChanges, busy: computed(() => busy.value || loading.value) })
let disposed = false
let timer
let previewSequence = 0
let previewAbort
const requests = new Set()
const clone = value => JSON.parse(JSON.stringify(value))
const base = computed(() => `/api/notifications/templates/${props.provider}/${event.value}`)
const status = computed(() => ({draft:'草稿',published:'已发布',default:'内置默认'}[detail.value?.status] || '历史'))
const canPublish = computed(() => detail.value && (detail.value.status === 'draft' || hasUnsavedChanges.value))
const previewDocument = computed(() => {
  const html = (preview.value?.htmlBody || '').replaceAll('<tg-spoiler>', '<span class="spoiler">').replaceAll('</tg-spoiler>', '</span>')
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS:['b','i','u','s','a','code','pre','blockquote','span'], ALLOWED_ATTR:['class'] })
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:14px/1.6 system-ui;white-space:pre-wrap;overflow-wrap:anywhere;padding:16px;color:#172b4d;background:#fff}a{color:#1769d2;text-decoration:underline}pre,code{background:#f1f3f5}blockquote{border-left:3px solid #aaa;margin-left:0;padding-left:12px}.spoiler{background:#cbd5e1;color:#64748b}</style></head><body>${clean}</body></html>`
})

async function request(method, url, data) {
  const controller = new AbortController()
  requests.add(controller)
  try {
    const response = await http({method,url,data,signal:controller.signal})
    if (!response.data?.success) throw new Error(response.data?.message || '服务器未确认操作成功')
    return response.data.data
  } finally { requests.delete(controller) }
}
function apply(value) {
  detail.value = value
  source.value = clone(value.source)
  saved.value = JSON.stringify(value.source)
}
async function load() {
  loading.value = true
  error.value = ''
  preview.value = null
  try {
    const value = await request('GET', base.value)
    if (!disposed) apply(value)
  } catch (e) { if (!disposed) error.value = e.response?.data?.message || e.message || '模板加载失败' }
  finally { if (!disposed) loading.value = false }
}
async function selectEvent(value) {
  if (value === event.value || loading.value || busy.value) return
  if (hasUnsavedChanges.value && !window.confirm('当前模板有未保存修改，确定切换事件吗？')) return
  clearTimeout(timer)
  previewAbort?.abort()
  previewSequence++
  event.value = value
  detail.value = null
  notice.value = ''
  await load()
}
async function refreshPreview() {
  if (disposed) return
  clearTimeout(timer)
  previewAbort?.abort()
  const sequence = ++previewSequence
  const controller = new AbortController()
  previewAbort = controller
  previewing.value = true
  preview.value = null
  previewError.value = ''
  try {
    const response = await http.post(`${base.value}/preview`, clone(source.value), {signal:controller.signal})
    if (disposed || sequence !== previewSequence) return
    if (!response.data?.success) throw new Error(response.data?.message || '预览失败')
    preview.value = response.data.data
  } catch (e) {
    if (!disposed && sequence === previewSequence && !controller.signal.aborted) previewError.value = e.response?.data?.message || e.message || '预览失败'
  } finally { if (!disposed && sequence === previewSequence) previewing.value = false }
}
watch(source, () => {
  clearTimeout(timer)
  previewSequence++
  previewAbort?.abort()
  preview.value = null
  previewError.value = ''
  if (!disposed && !loading.value && detail.value) timer = setTimeout(refreshPreview, 450)
}, {deep:true, flush:'post'})
watch(loading, value => { if (!value && detail.value) refreshPreview() })

async function save() {
  const value = await request('POST', `${base.value}/draft`, {expectedRevision:detail.value.revision,source:clone(source.value)})
  if (!disposed) apply(value)
}
async function act(action, version) {
  if (busy.value || loading.value || !detail.value) return
  if (action === 'restore' && hasUnsavedChanges.value && !window.confirm('恢复历史版本会替换未保存修改，确定继续吗？')) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    if (action === 'draft' || (action === 'publish' && hasUnsavedChanges.value)) await save()
    if (disposed) return
    if (action !== 'draft') {
      const value = await request('POST', `${base.value}/${action}`, {expectedRevision:detail.value.revision,version})
      if (!disposed) apply(value)
    }
    if (!disposed) {
      notice.value = action === 'publish' ? '模板已发布，后续领取的通知使用此版本。' : action === 'restore' ? '历史版本已恢复为草稿，发布后生效。' : '草稿已保存，实际通知继续使用已发布版本。'
      await refreshPreview()
    }
  } catch (e) { if (!disposed) error.value = e.response?.data?.message || e.message || '模板操作失败' }
  finally { if (!disposed) busy.value = false }
}
function reset() {
  if (hasUnsavedChanges.value && !window.confirm('载入默认模板会替换未保存修改，确定继续吗？')) return
  source.value = clone(detail.value.defaultSource)
}
function reload() {
  if (hasUnsavedChanges.value && !window.confirm('重新加载会放弃本地修改，确定继续吗？')) return
  load()
}
onMounted(load)
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(timer)
  previewSequence++
  previewAbort?.abort()
  requests.forEach(c => c.abort())
})
</script>

<template>
  <div class="space-y-4 p-5">
    <div class="alert alert-info text-sm"><span>{{ providerLabel(provider) }} 支持在线模拟预览。此处未接入官方客户端原样预览，字体、主题、链接提示等以实际客户端为准。预览使用固定示例数据，不会发送消息。</span></div>
    <p v-if="error" role="alert" class="alert alert-error">{{ error }} <button v-if="!busy && !loading" class="btn btn-sm" @click="reload">重新加载</button></p>
    <p v-if="notice" role="status" class="alert alert-success">{{ notice }}</p>
    <div class="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_minmax(320px,0.8fr)]">
      <aside class="card card-border border-base-300 bg-base-100 p-4">
        <h2 class="font-semibold">通知事件</h2>
        <ul class="menu mt-2 p-0"><li v-for="item in notificationEvents" :key="item.value"><button :disabled="loading || busy" :class="{active:event === item.value}" @click="selectEvent(item.value)">{{ item.label }}</button></li></ul>
        <div class="divider"></div><h2 class="font-semibold">历史版本</h2>
        <div class="mt-2 max-h-96 space-y-2 overflow-auto">
          <div v-for="version in detail?.versions || []" :key="version.version" class="rounded border border-base-300 p-2 text-xs">
            <p>版本 {{ version.version }} · {{ {draft:'草稿',published:'已发布',archived:'历史'}[version.status] }}</p>
            <p class="mt-1 opacity-60">{{ formatDateTime(version.createdAt) }}</p>
            <button v-if="version.status !== 'draft'" class="btn btn-ghost btn-xs mt-1" :disabled="busy || loading" @click="act('restore',version.version)">恢复为草稿</button>
          </div>
          <p v-if="!detail?.versions?.length" class="text-xs opacity-60">尚未保存，使用内置纯文本模板。</p>
        </div>
      </aside>
      <main class="card card-border min-w-0 border-base-300 bg-base-100 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2"><h2 class="font-semibold">{{ providerLabel(provider) }} 模板 · {{ status }}</h2><span v-if="detail?.activeVersion" class="text-xs">已发布 v{{ detail.activeVersion }}</span></div>
        <div v-if="loading" class="py-12 text-center"><span class="loading loading-spinner"></span></div>
        <template v-else-if="detail">
          <p v-if="hasUnsavedChanges" class="mt-2 text-xs text-warning">存在未保存修改</p>
          <fieldset :disabled="busy" class="mt-3 space-y-4">
            <label class="block text-sm">消息格式<select v-model="source.format" class="select mt-1 w-full"><option value="text">纯文本</option><option value="html">{{ provider === 'feishu' ? '富文本（转换为飞书 post）' : 'HTML 富文本' }}</option></select></label>
            <label class="block text-sm">消息标题<input v-model="source.titleTemplate" maxlength="500" class="input mt-1 w-full font-mono" /></label>
            <label class="block text-sm">消息正文<textarea v-model="source.bodyTemplate" rows="17" class="textarea mt-1 w-full font-mono" spellcheck="false"></textarea></label>
          </fieldset>
          <p class="mt-2 text-xs opacity-70">支持 Tera 变量和条件。富文本支持 &lt;b&gt;、&lt;i&gt;、&lt;u&gt;、&lt;s&gt;、&lt;a href="https://…"&gt;；{{ provider === 'telegram' ? '另支持独立的 code、pre、blockquote 和 tg-spoiler。' : '发送时转换为飞书原生样式。' }}换行请直接输入换行符。不支持 CSS、图片、卡片或任意网页 HTML。</p>
          <p class="mt-2 text-xs opacity-70">标题以纯文本编辑；事件 ID 自动附加。变量内容自动转义。真实消息超过平台限制时会记录投递失败。</p>
          <div class="mt-3 flex flex-wrap gap-2"><button class="btn btn-sm" :disabled="busy" @click="reset">载入默认模板</button><button class="btn btn-sm" :disabled="busy || !hasUnsavedChanges" @click="act('draft')">保存草稿</button><button class="btn btn-primary btn-sm" :disabled="busy || !canPublish" @click="act('publish')">{{ busy ? '处理中…' : '发布模板' }}</button></div>
          <h3 class="mt-5 text-sm font-semibold">可用变量</h3><div class="mt-2 flex flex-wrap gap-2"><code v-for="variable in detail.variables" :key="variable" class="rounded bg-base-200 px-2 py-1 text-xs" v-text="`{{ ${variable} }}`"></code></div>
          <p class="mt-3 text-xs opacity-60">发布后，可在「通知渠道」中使用实际目标测试投递。该测试检查连通性，采用固定测试消息。</p>
        </template>
      </main>
      <aside class="card card-border min-w-0 border-base-300 bg-base-100 p-4">
        <div class="flex items-center justify-between"><h2 class="font-semibold">在线预览</h2><button class="btn btn-ghost btn-sm" :disabled="loading || busy || !detail" @click="refreshPreview">{{ previewing ? '渲染中…' : '刷新预览' }}</button></div>
        <div class="tabs tabs-box mt-3"><button v-for="tab in [{value:'rendered',label:'效果'},{value:'text',label:'文本'},{value:'payload',label:'消息数据'}]" :key="tab.value" class="tab" :class="{'tab-active':previewTab===tab.value}" @click="previewTab=tab.value">{{ tab.label }}</button></div>
        <p v-if="previewError" role="alert" class="mt-3 text-sm text-error">{{ previewError }}</p>
        <template v-if="preview">
          <iframe v-if="previewTab==='rendered'" title="通知模板模拟预览" sandbox="" :srcdoc="previewDocument" class="mt-3 h-[540px] w-full rounded border border-base-300 bg-white"></iframe>
          <pre v-else class="mt-3 h-[540px] overflow-auto whitespace-pre-wrap break-all rounded bg-base-200 p-3 text-xs">{{ previewTab==='text' ? preview.textBody : JSON.stringify(preview.payload,null,2) }}</pre>
        </template>
        <p v-else-if="!previewError" class="mt-5 text-sm opacity-60">{{ previewing ? '正在使用示例数据渲染…' : '编辑后自动预览。' }}</p>
        <p class="mt-3 text-xs opacity-60">模拟预览不加载外部资源，也不会打开链接；实际链接地址可在消息数据中核对。</p>
      </aside>
    </div>
  </div>
</template>
