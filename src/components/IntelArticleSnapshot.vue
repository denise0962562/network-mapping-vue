<script setup>
import { onBeforeUnmount, ref } from 'vue'
import http from '../utils/http'
import { articleIntakeLabel, intelError } from '../utils/threatIntel'
const props = defineProps({ article: { type: Object, required: true } })
const dialog = ref(null), snapshot = ref(null), loading = ref(false), error = ref('')
let controller, version = 0
async function open() {
  dialog.value?.showModal(); snapshot.value = null; error.value = ''; loading.value = true
  controller?.abort(); controller = new AbortController(); const current = ++version
  try { const response = await http.get(`/api/intel/articles/${props.article.id}`, { signal: controller.signal }); if (current === version) snapshot.value = response.data.data }
  catch (e) { if (current === version && e.code !== 'ERR_CANCELED') error.value = intelError(e) }
  finally { if (current === version) loading.value = false }
}
onBeforeUnmount(() => { version++; controller?.abort() })
</script>

<template>
  <button type="button" class="btn btn-ghost btn-xs" @click="open">查看快照</button>
  <dialog ref="dialog" class="modal">
    <div class="modal-box max-w-3xl space-y-3 text-left whitespace-normal">
      <h2 class="text-lg font-semibold">{{ article.title || '文章快照' }}</h2>
      <span v-if="loading" class="loading loading-spinner loading-sm"></span>
      <p v-if="error" role="alert" class="text-error">{{ error }}</p>
      <template v-if="snapshot"><p class="text-xs opacity-65">{{ articleIntakeLabel(snapshot.extraction_metadata) }}</p><p v-if="snapshot.body" class="max-h-[65vh] overflow-auto whitespace-pre-wrap break-words rounded bg-base-200 p-3 text-sm">{{ snapshot.body }}</p><p v-else class="text-sm opacity-65">尚未保存正文快照。</p></template>
      <div class="modal-action"><button type="button" class="btn" @click="dialog?.close()">关闭</button></div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>关闭</button></form>
  </dialog>
</template>
