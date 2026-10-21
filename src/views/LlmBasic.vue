<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { availableModels, llmError, settingsPayload } from '@/utils/llm'
import { chatRequest } from '@/utils/llmChat'
import http from '@/utils/http'

const state = ref(null), enabled = ref(false), providerId = ref(''), modelId = ref(''), saved = ref('')
const loading = ref(false), busy = ref(false), error = ref(''), alerts = ref([])
const chatProvider = ref(''), chatModel = ref(''), input = ref(''), messages = ref([]), generating = ref(false), transcript = ref(null)
const session = ref(crypto.randomUUID())
const provider = computed(() => state.value?.providers.find(p => p.id === providerId.value))
const debugProvider = computed(() => state.value?.providers.find(p => p.id === chatProvider.value))
const selected = computed(() => JSON.stringify([enabled.value, providerId.value, modelId.value]))
const dirty = computed(() => state.value && selected.value !== saved.value)
useUnsavedChanges(dirty, save)
const requests = new AbortController()
let disposed = false, chatController, chatVersion = 0

async function load() {
  loading.value = true; error.value = ''
  try {
    const r = await http.get('/api/llm/settings', { signal: requests.signal })
    if (disposed) return
    state.value = r.data.data
    enabled.value = state.value.enabled; providerId.value = state.value.provider_id || ''; modelId.value = state.value.model_id || ''
    saved.value = selected.value
    if (!chatProvider.value) { chatProvider.value = providerId.value; chatModel.value = modelId.value }
  } catch (e) { if (!disposed && e.code !== 'ERR_CANCELED') error.value = llmError(e) }
  finally { if (!disposed) loading.value = false }
}
function refresh() { if (dirty.value && !window.confirm('刷新将放弃未保存的选择，确定继续吗？')) return; load() }
function chooseProvider() { modelId.value = provider.value?.default_model || availableModels(provider.value)[0]?.id || ''; if (!providerId.value) modelId.value = '' }
async function save() {
  if (!state.value || busy.value) return false
  if (enabled.value && (!providerId.value || !modelId.value)) { error.value = '启用 IOC 提取前请选择一个供应商及模型。'; return false }
  busy.value = true; error.value = ''
  try {
    await http.put('/api/llm/settings', settingsPayload(state.value, { enabled: enabled.value, provider_id: providerId.value || null, model_id: modelId.value || null }), { signal: requests.signal })
    if (!disposed) { await load(); alerts.value.unshift({ id: crypto.randomUUID(), title: 'IOC 提取设置已保存。' }) }
    return true
  } catch (e) { if (!disposed && e.code !== 'ERR_CANCELED') error.value = llmError(e); return false }
  finally { busy.value = false }
}
function newSession() { chatVersion++; chatController?.abort(); generating.value = false; messages.value = []; input.value = ''; session.value = crypto.randomUUID() }
function chooseChatProvider() { chatModel.value = debugProvider.value?.default_model || availableModels(debugProvider.value)[0]?.id || ''; newSession() }
function stop() { chatController?.abort() }
async function scroll() { await nextTick(); if (transcript.value) transcript.value.scrollTop = transcript.value.scrollHeight }
async function send() {
  const text = input.value.trim()
  if (!text || generating.value || !chatProvider.value || !chatModel.value) return
  if (messages.value.length >= 60) { error.value = '当前对话较长，请新建会话后继续。'; return }
  const current = ++chatVersion
  chatController = new AbortController(); generating.value = true
  const history = [...messages.value.filter(m => m.complete).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: text }]
  messages.value.push({ role: 'user', content: text, complete: true })
  messages.value.push({ role: 'assistant', content: '', complete: false, status: '正在连接…' })
  const index = messages.value.length - 1
  input.value = ''; await scroll()
  if (disposed || current !== chatVersion) return
  try {
    await chatRequest({ provider_id: chatProvider.value, model_id: chatModel.value, session_id: session.value, messages: history }, chatController.signal, event => {
      if (disposed || current !== chatVersion) return
      const answer = messages.value[index]
      if (event.type === 'started') answer.status = event.stream ? '正在生成…' : '等待完整响应…'
      if (event.type === 'delta') { answer.content += event.text; answer.status = '正在生成…' }
      if (event.type === 'done') { answer.content = event.text; answer.complete = true; answer.status = `完成 · ${(event.elapsed_ms / 1000).toFixed(1)} 秒`; answer.usage = event.usage; answer.firstDeltaMs = event.first_delta_ms }
      if (event.type === 'error') answer.status = llmError(event.code)
      scroll()
    })
  } catch (e) {
    if (!disposed && current === chatVersion) messages.value[index].status = e.name === 'AbortError' ? '已停止，未完整的回答不会继续发送。' : llmError(e.response ? e : e.message)
  } finally { if (!disposed && current === chatVersion) { generating.value = false; await scroll() } }
}
onMounted(load)
onBeforeUnmount(() => { disposed = true; requests.abort(); chatController?.abort() })
</script>

<template>
  <div class="page-shell space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3"><div><h1 class="page-title">LLM 基础</h1><p class="mt-2 text-sm opacity-65">选择 IOC 提取使用的供应商和模型，并通过对话调试连接。</p></div><button class="btn btn-outline btn-sm" :disabled="loading || busy" @click="refresh">{{ loading ? '加载中…' : '刷新' }}</button></div>
    <AppAlert v-for="alert in alerts" :key="alert.id" :title="alert.title" type="success" @close="alerts = alerts.filter(a => a.id !== alert.id)" />
    <div v-if="error" role="alert" class="alert alert-error">{{ error }}</div>
    <template v-if="state">
      <form class="card border border-base-300 bg-base-100 p-4 space-y-4" @submit.prevent="save">
        <div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-semibold">IOC 提取</h2><button class="btn btn-neutral btn-sm" :disabled="busy || loading || !dirty">{{ busy ? '保存中…' : '保存设置' }}</button></div>
        <label class="flex items-center gap-2 text-sm"><input v-model="enabled" type="checkbox" class="toggle toggle-sm" />启用 LLM IOC 提取</label>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3">
          <label class="form-control text-sm">供应商<select v-model="providerId" class="select select-bordered mt-1 w-full" :required="enabled" @change="chooseProvider"><option disabled selected value="">请选择</option><option v-for="p in state.providers" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
          <label class="form-control text-sm">模型<select v-model="modelId" class="select select-bordered mt-1 w-full" :required="Boolean(providerId)" :disabled="!providerId"><option disabled selected value="">请选择</option><option v-for="m in availableModels(provider)" :key="m.id" :value="m.id">{{ m.name || m.id }}</option></select></label>
        </div>
        <p class="text-sm opacity-65">一次只使用一组供应商和模型。暂停保留当前选择；可信 IOC 同步继续运行，LLM 提议仍须人工审核。</p>
        <div v-if="state.effective && !dirty" class="rounded-box border border-base-300 p-3 text-sm space-y-1"><p>当前生效：{{ state.providers.find(p => p.id === state.provider_id)?.name }} / {{ state.model_id }}</p><p class="opacity-65">流式{{ state.effective.stream ? '开启' : '关闭' }} · {{ { system: '系统代理', direct: '直连', custom: '指定代理' }[state.effective.proxy_mode] }} · Session {{ state.effective.session_mode === 'disabled' ? '关闭' : state.effective.session_mode === 'auto' ? '自动生成' : '固定值' }}</p></div>
        <router-link to="/llm/providers" class="link text-sm">管理供应商与全局配置</router-link>
      </form>
      <section class="card border border-base-300 bg-base-100 p-4 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-semibold">在线调试</h2><button type="button" class="btn btn-ghost btn-sm" @click="newSession">新建会话／清空</button></div>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3">
          <label class="form-control text-sm">调试供应商<select v-model="chatProvider" class="select select-bordered mt-1 w-full" :disabled="generating" @change="chooseChatProvider"><option disabled selected value="">请选择</option><option v-for="p in state.providers" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
          <label class="form-control text-sm">调试模型<select v-model="chatModel" class="select select-bordered mt-1 w-full" :disabled="generating || !chatProvider" @change="newSession"><option disabled selected value="">请选择</option><option v-for="m in availableModels(debugProvider)" :key="m.id" :value="m.id">{{ m.name || m.id }}</option></select></label>
        </div>
        <p class="text-xs opacity-60">临时调试不改变 IOC 提取配置。切换模型会清空会话；对话仅保留在当前页面，使用所选供应商的请求设置。</p>
        <div ref="transcript" role="log" aria-label="调试对话" aria-live="polite" class="min-h-48 max-h-[32rem] overflow-y-auto rounded-box border border-base-300 p-3">
          <p v-if="!messages.length" class="py-12 text-center text-sm opacity-60">选择供应商和模型后发送消息，检查连接与回答。</p>
          <div v-for="(m, index) in messages" :key="index" class="chat" :class="m.role === 'user' ? 'chat-end' : 'chat-start'">
            <div class="chat-header mb-1 opacity-60">{{ m.role === 'user' ? '你' : '模型' }}</div><div class="chat-bubble max-w-full whitespace-pre-wrap break-words" :class="m.role === 'user' ? 'chat-bubble-neutral' : 'bg-base-200 text-base-content'">{{ m.content || '…' }}</div>
            <div v-if="m.role === 'assistant'" class="chat-footer mt-1 max-w-full break-words text-xs opacity-65">{{ m.status }}<span v-if="m.firstDeltaMs != null"> · 首段 {{ (m.firstDeltaMs / 1000).toFixed(1) }} 秒</span><span v-if="m.usage?.input_tokens != null"> · 输入 {{ m.usage.input_tokens }} token</span><span v-if="m.usage?.output_tokens != null"> · 输出 {{ m.usage.output_tokens }} token</span></div>
          </div>
        </div>
        <form class="space-y-3" @submit.prevent="send">
          <label class="form-control text-sm">消息<textarea v-model="input" required maxlength="32000" rows="3" class="textarea textarea-bordered mt-1 mb-5 w-full" :disabled="generating" placeholder="输入调试消息" />
          </label><div class="flex justify-end gap-2"><button v-if="generating" type="button" class="btn btn-outline btn-sm" @click="stop">停止生成</button><button class="btn btn-neutral btn-sm" :disabled="generating || !input.trim() || !chatModel">{{ generating ? '正在生成…' : '发送' }}</button></div></form>
      </section>
    </template>
  </div>
</template>
