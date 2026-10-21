<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import http from '../utils/http'
import { evidenceExcerpt, intelError, states, roleLabel } from '../utils/threatIntel'
import { articleIocLocations, reportReviewItems } from '../utils/intelReportReview'
import IntelActorReview from './IntelActorReview.vue'
import IntelEvidenceQuote from './IntelEvidenceQuote.vue'

const emit = defineEmits(['complete'])
const dialog = ref(null), report = ref(null), article = ref(null), records = ref([]), decisions = ref({}), attribution = ref({})
const loading = ref(false), saving = ref(false), error = ref(''), reason = ref(''), selected = ref(null), focused = ref(null), mark = ref(null)
let controller, version = 0
const locations = computed(() => articleIocLocations(article.value?.body, records.value))
const items = computed(() => reportReviewItems(records.value, decisions.value, attribution.value))
const missing = computed(() => loading.value || !article.value?.body ? [] : records.value.filter(record => decisions.value[record.id] && !locations.value.has(record.id)))
const excerpt = computed(() => evidenceExcerpt(article.value?.body, focused.value))
const blocked = computed(() => loading.value || saving.value || !reason.value.trim() || !items.value.length || (items.value.some(item => item.decision === 'approved') && !article.value?.body?.trim()))

async function load() {
  const current = ++version
  controller?.abort(); controller = new AbortController()
  loading.value = true; error.value = ''; article.value = null; records.value = []; selected.value = null; focused.value = null; decisions.value = {}; attribution.value = {}
  try {
    const response = await http.get(`/api/intel/articles/${report.value.article_id}/review`, { signal: controller.signal })
    if (current !== version) return
    const data = response.data.data
    article.value = data.article; records.value = data.records
    for (const record of records.value) if (record.status === 'pending') decisions.value[record.id] = 'approved'
    selected.value = records.value.find(record => record.status === 'pending') || records.value[0] || null
  } catch (e) { if (current === version && e.code !== 'ERR_CANCELED') error.value = intelError(e) }
  finally { if (current === version) loading.value = false }
}
async function open(group) {
  report.value = group; reason.value = ''; dialog.value?.showModal()
  await load()
}
async function locate(record) {
  selected.value = record
  await locateSpan(locations.value.get(record.id))
}
async function locateSpan(span) {
  if (!evidenceExcerpt(article.value?.body, span)) { focused.value = null; return }
  focused.value = span
  await nextTick()
  mark.value?.scrollIntoView({ block: 'nearest' })
}
function decideAll(decision) {
  for (const record of records.value) if (record.status === 'pending') decisions.value[record.id] = decision
}
async function submit() {
  if (blocked.value) return
  saving.value = true; error.value = ''
  try {
    await http.post(`/api/intel/articles/${report.value.article_id}/review`, { body_hash: article.value.body_hash, reason: reason.value.trim(), items: items.value }, { signal: controller.signal })
    dialog.value?.close(); emit('complete')
  } catch (e) { error.value = intelError(e) }
  finally { saving.value = false }
}
function close() { if (!saving.value) dialog.value?.close() }
function cancel(event) { if (saving.value) event.preventDefault() }
function stop() { version++; controller?.abort() }
function closed() { if (!dialog.value?.open) stop() }
onBeforeUnmount(stop)
defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="modal" @cancel="cancel" @close="closed">
    <form class="modal-box max-w-7xl space-y-4" @submit.prevent="submit">
      <h2 class="text-lg font-semibold">审核报告 · {{ article?.title || report?.title || '文章提议' }}</h2>
      <p class="text-sm opacity-65">同一报告集中审核；点击 IOC 查看其原文位置，可逐条接纳、拒绝或暂不处理。</p>
      <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
      <span v-if="loading" class="loading loading-spinner loading-sm"></span>
      <template v-else-if="article">
        <div v-if="missing.length" role="alert" class="alert alert-warning text-sm"><div><p>以下 {{ missing.length }} 条送审 IOC 未在原文中找到，请核对后再决定：</p><p class="mt-1 break-all font-mono">{{ missing.map(record => record.value).join('、') }}</p></div></div>
        <div class="grid min-w-0 gap-4 lg:grid-cols-2">
          <div class="min-w-0 space-y-3">
            <div class="flex flex-wrap items-center gap-2 text-sm"><span>本报告 {{ records.length }} 条 IOC，待审 {{ records.filter(record => record.status === 'pending').length }} 条</span><button type="button" class="btn btn-ghost btn-xs" :disabled="saving" @click="decideAll('approved')">全部接纳</button><button type="button" class="btn btn-ghost btn-xs" :disabled="saving" @click="decideAll('rejected')">全部拒绝</button><button type="button" class="btn btn-ghost btn-xs" :disabled="saving" @click="decideAll('')">全部暂不处理</button></div>
            <div class="max-h-80 overflow-auto rounded border border-base-300"><table class="table table-sm min-w-[32rem]"><thead><tr><th>IOC</th><th>角色 / 状态</th><th>审核决定</th></tr></thead><tbody><tr v-for="record in records" :key="record.id" :class="selected?.id === record.id ? 'bg-base-200' : ''"><td><span class="badge badge-outline badge-xs">{{ record.type }}</span><button type="button" class="link link-hover mt-1 block max-w-xs break-all text-left font-mono" :aria-label="`定位 IOC ${record.value}`" @click="locate(record)">{{ record.value }}</button></td><td>{{ roleLabel(record.payload.role) }}<p class="text-xs opacity-65">{{ states[record.status] }}</p></td><td><select v-if="record.status === 'pending'" v-model="decisions[record.id]" class="select select-bordered select-xs w-28" :disabled="saving" :aria-label="`${record.value} 的审核决定`"><option value="approved">接纳</option><option value="rejected">拒绝</option><option value="">暂不处理</option></select><span v-else class="text-xs opacity-65">已审核</span></td></tr><tr v-if="!records.length"><td colspan="3" class="py-6 text-center opacity-65">本报告没有待审提议。</td></tr></tbody></table></div>
            <template v-if="selected"><h3 class="break-all text-sm font-semibold">{{ selected.value }} 的支持证据</h3><IntelEvidenceQuote :payload="selected.payload" :locatable="Boolean(article.body)" @locate="locateSpan" /><IntelActorReview v-if="selected.status === 'pending' && decisions[selected.id] === 'approved' && (selected.payload.actor_name || selected.actor_id)" :key="selected.id" :record="selected" :initial-decision="attribution[selected.id]" :disabled="saving" @change="attribution[selected.id] = $event" /></template>
          </div>
          <div class="min-w-0"><h3 class="font-semibold">文章快照</h3><p v-if="article.body" class="mt-2 max-h-[65vh] overflow-auto whitespace-pre-wrap break-words rounded bg-base-200 p-3 text-sm"><template v-if="excerpt">{{ excerpt.before }}<mark ref="mark" class="bg-warning text-warning-content">{{ excerpt.quote }}</mark>{{ excerpt.after }}</template><template v-else>{{ article.body }}</template></p><p v-else role="alert" class="mt-2 text-sm text-error">文章快照没有有效正文，暂不能接纳。</p></div>
        </div>
        <label class="form-control text-sm">审核说明<textarea v-model="reason" class="textarea textarea-bordered mt-1 w-full" :disabled="saving" maxlength="1000" rows="2" required></textarea></label>
        <p class="text-xs opacity-65">接纳后才进入有效 IOC 库；本次选定的决定将一起保存。</p>
      </template>
      <div class="modal-action"><button v-if="error" type="button" class="btn btn-outline" :disabled="loading || saving" @click="load">重新加载报告</button><button type="button" class="btn btn-ghost" :disabled="saving" @click="close">关闭</button><button type="submit" class="btn btn-neutral" :disabled="blocked">提交 {{ items.length }} 条审核决定</button></div>
    </form>
    <form method="dialog" class="modal-backdrop"><button :disabled="saving">关闭</button></form>
  </dialog>
</template>
