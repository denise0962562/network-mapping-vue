<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import http from '../utils/http'
import { intelError } from '../utils/threatIntel'
const props = defineProps({ sources: { type: Array, default: () => [] } })
const emit = defineEmits(['saved'])
const available = computed(() => props.sources.filter(source => source.enabled && source.kind === 'article' && source.transport === 'manual'))
const sourceId = ref(''), title = ref(''), url = ref(''), body = ref(''), error = ref(''), notice = ref(''), busy = ref(false)
let controller, disposed = false
async function submit() {
  const source = available.value.find(source => source.id === sourceId.value)
  if (!source || busy.value) return
  error.value = ''; notice.value = ''; busy.value = true; controller = new AbortController()
  try {
    await http.post('/api/intel/articles', { source_id: source.id, expected_revision: source.revision, title: title.value.trim(), url: url.value.trim(), body: body.value.trim() || null }, { signal: controller.signal, timeout: 15000 })
    if (disposed) return
    title.value = ''; url.value = ''; body.value = ''; notice.value = '文章已保存并排队；AI 关闭时保留等待，提取结果必须人工审核后才生效。'
    emit('saved')
  } catch (e) { if (!disposed && e.code !== 'ERR_CANCELED') error.value = intelError(e) }
  finally { busy.value = false; controller = null }
}
onBeforeUnmount(() => { disposed = true; controller?.abort() })
</script>

<template>
  <details class="card border border-base-300 bg-base-100 p-4">
    <summary class="cursor-pointer font-semibold">提交文章链接 / 正文快照</summary>
    <p class="my-3 text-sm opacity-65">所有结果均作为 AI 提议，固定人工审核。只提交链接时后台抓取正文；微信页面需绑定来源账号。抓取受限时可粘贴纯文本，系统会注明由管理员提供。</p>
    <p v-if="!available.length" class="text-sm text-warning">请先在来源页添加并启用“手动文章 / 微信正文”来源，配置允许的文章域名。</p>
    <form v-else class="space-y-3" @submit.prevent="submit">
      <p v-if="error" role="alert" class="text-error">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
      <label class="form-control text-sm">来源<select v-model="sourceId" class="select select-bordered mt-1 w-full" required :disabled="busy"><option disabled value="">选择文章来源</option><option v-for="source in available" :key="source.id" :value="source.id">{{ source.name }}</option></select></label>
      <label class="form-control text-sm">标题<input v-model="title" maxlength="500" class="input input-bordered mt-1 w-full" required :disabled="busy" /></label>
      <label class="form-control text-sm">原文 HTTPS 地址<input v-model="url" type="url" maxlength="4096" class="input input-bordered mt-1 w-full" required :disabled="busy" /></label>
      <label class="form-control text-sm">正文快照（可选，纯文本；40～100,000 UTF-8 字节）<textarea v-model="body" maxlength="100000" class="textarea textarea-bordered mt-1 w-full" rows="8" :disabled="busy" placeholder="留空由后台抓取；也可粘贴完整正文和表格，核对序号、IP、ASN 与上下文。"></textarea></label>
      <button class="btn btn-primary btn-sm" :disabled="busy || !sourceId">{{ busy ? '正在保存…' : '保存并加入 AI 队列' }}</button>
    </form>
  </details>
</template>
