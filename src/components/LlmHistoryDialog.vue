<script setup>
import { onBeforeUnmount, ref } from 'vue'
import http from '@/utils/http'
import { llmError } from '@/utils/llm'
import { formatDateTime } from '@/utils/systemTime'
const emit = defineEmits(['loaded', 'deleted'])
const dialog = ref(null), rows = ref([]), selected = ref(''), offset = ref(0), total = ref(0), loading = ref(false), error = ref('')
const requests = new AbortController()
let disposed = false
async function fetchPage(value = 0) {
  loading.value = true; error.value = ''
  try {
    const response = await http.get('/api/llm/conversations', { params: { offset: value }, signal: requests.signal })
    if (disposed) return
    rows.value = response.data.data.items; total.value = response.data.data.total; offset.value = value; selected.value = ''
  } catch (e) { if (!disposed) error.value = llmError(e) }
  finally { if (!disposed) loading.value = false }
}
function open() { if (loading.value) return; dialog.value.showModal(); fetchPage() }
async function loadSelected() {
  if (!selected.value || loading.value) return
  const id = selected.value
  loading.value = true; error.value = ''
  try {
    const response = await http.get(`/api/llm/conversations/${id}`, { signal: requests.signal })
    if (disposed) return
    emit('loaded', { ...response.data.data, id }); dialog.value.close()
  } catch (e) { if (!disposed) error.value = llmError(e) }
  finally { if (!disposed) loading.value = false }
}
async function remove(row) {
  if (loading.value || !window.confirm('永久删除这条历史对话（包括思考数据）？')) return
  loading.value = true; error.value = ''
  try {
    await http.delete(`/api/llm/conversations/${row.id}`, { signal: requests.signal })
    if (disposed) return
    emit('deleted', row.id)
    await fetchPage(rows.value.length === 1 ? Math.max(0, offset.value - 30) : offset.value)
  } catch (e) { if (!disposed) error.value = llmError(e) }
  finally { if (!disposed) loading.value = false }
}
defineExpose({ open })
onBeforeUnmount(() => { disposed = true; requests.abort() })
</script>
<template>
  <dialog ref="dialog" class="modal" aria-labelledby="llm-history-title" @cancel.prevent="!loading && dialog.close()">
    <div class="modal-box w-11/12 max-w-4xl space-y-4">
      <h2 id="llm-history-title" class="text-lg font-semibold">加载历史对话</h2>
      <p class="text-sm opacity-65">可选择 IOC 提取记录或自己的历史调试。加载只恢复上下文，发送后才会调用供应商；继续调试另存记录，保留原历史。</p>
      <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>
      <div class="overflow-x-auto">
        <table class="table table-sm"><thead><tr><th>选择</th><th>类型 / 状态</th><th>模型 / 文章</th><th>最后更新</th><th></th></tr></thead><tbody>
          <tr v-for="row in rows" :key="row.id" :class="{ 'bg-base-200': selected === row.id }">
            <td><input v-model="selected" type="radio" name="llm-history" :value="row.id" :disabled="loading" class="radio radio-sm" :aria-label="`选择 ${row.model_id} ${formatDateTime(row.updated_at)}`" /></td>
            <td><span class="badge badge-sm" :class="row.kind === 'ioc' ? 'badge-info badge-outline' : 'badge-ghost'">{{ row.kind === 'ioc' ? 'IOC 提取' : '调试' }}</span><p class="mt-1 text-xs opacity-60">{{ { completed: '完成', failed: '失败', cancelled: '已停止', running: '处理中 / 尚未完成' }[row.status] || row.status }}</p></td>
            <td class="max-w-xs break-all">{{ row.model_id }}<p v-if="row.article_id" class="text-xs opacity-60">文章 {{ row.article_id }}</p><p class="text-xs opacity-60">会话 {{ row.id.slice(0, 8) }}</p></td>
            <td class="whitespace-nowrap text-xs">{{ formatDateTime(row.updated_at) }}</td>
            <td><button type="button" class="btn btn-ghost btn-xs text-error" :disabled="loading" @click="remove(row)">删除</button></td>
          </tr>
          <tr v-if="!rows.length"><td colspan="5" class="py-8 text-center opacity-60">{{ loading ? '加载中…' : '暂无保存的对话，可在 IOC 提取卡片中启用保留。' }}</td></tr>
        </tbody></table>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 text-sm"><span>共 {{ total }} 条</span><div class="join"><button type="button" class="btn btn-outline btn-sm join-item" :disabled="loading || offset === 0" @click="fetchPage(Math.max(0, offset - 30))">上一页</button><button type="button" class="btn btn-outline btn-sm join-item" :disabled="loading || offset + 30 >= total" @click="fetchPage(offset + 30)">下一页</button></div></div>
      <div class="modal-action"><button type="button" class="btn btn-ghost" :disabled="loading" @click="dialog.close()">取消</button><button type="button" class="btn btn-neutral" :disabled="loading || !selected" @click="loadSelected">{{ loading ? '加载中…' : '加载对话' }}</button></div>
    </div>
  </dialog>
</template>
