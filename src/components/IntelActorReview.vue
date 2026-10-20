<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import http from '../utils/http'
import { intelError } from '../utils/threatIntel'
const props = defineProps({ record: { type: Object, required: true }, disabled: Boolean, initialDecision: { type: Object, default: null } })
const emit = defineEmits(['change'])
const action = ref('keep'), actorId = ref(''), name = ref(''), query = ref(''), matches = ref([]), results = ref([]), error = ref(''), loading = ref(false)
let controller, version = 0, mounted = false
const options = computed(() => [...new Map([...matches.value, ...results.value].map(item => [item.attack_id, item])).values()])
const reportName = computed(() => props.record?.payload?.actor_name || '')
const basis = { exact_name: '名称相同', source_alias: '本来源已确认别名', associated_name: '关联名称候选，需核对' }
function publish() {
  emit('change', action.value === 'create' ? { action: 'create', name: name.value.trim() } : ['select', 'alias'].includes(action.value) ? { action: action.value, actor_id: actorId.value } : { action: action.value })
}
async function load() {
  const current = ++version
  controller?.abort(); controller = new AbortController()
  action.value = props.initialDecision?.action || 'keep'; actorId.value = props.initialDecision?.actor_id || ''; name.value = props.initialDecision?.name || reportName.value; query.value = reportName.value; matches.value = []; results.value = []; error.value = ''; loading.value = false; publish()
  if (!props.record?.id || !reportName.value) return
  loading.value = true
  try {
    const response = await http.get(`/api/intel/records/${props.record.id}/attribution`, { signal: controller.signal })
    if (current !== version) return
    matches.value = response.data.data.items
    actorId.value ||= props.record.actor_id || matches.value[0]?.attack_id || ''
  } catch (e) { if (current === version && e.code !== 'ERR_CANCELED') error.value = intelError(e) }
  finally { if (current === version) loading.value = false }
}
async function search() {
  if (loading.value) return
  const current = version
  loading.value = true; error.value = ''
  try {
    const response = await http.get('/api/intel/entities', { params: { kind: 'actor', q: query.value.trim() }, signal: controller.signal })
    if (current === version) results.value = response.data.data.items.filter(item => item.active)
  } catch (e) { if (current === version && e.code !== 'ERR_CANCELED') error.value = intelError(e) }
  finally { if (current === version) loading.value = false }
}
watch(() => props.record?.id, () => { if (mounted) load() })
onMounted(() => { mounted = true; load() })
onBeforeUnmount(() => { version++; controller?.abort() })
</script>

<template>
  <fieldset class="space-y-3 rounded border border-base-300 p-3 text-sm" :disabled="disabled">
    <legend class="px-1 font-semibold">组织归因审核</legend>
    <p>报告原名：{{ reportName || '未提供组织归因' }}</p>
    <p class="text-xs opacity-65">匹配候选由服务端提供。关联名称不自动视为等价别名；新建项为本地组织，不生成 MITRE 编号。</p>
    <p v-for="item in matches" :key="item.attack_id" class="break-words text-xs">{{ item.name }}（{{ item.attack_id }}） · {{ basis[item.basis] }}</p>
    <p v-if="error" role="alert" class="text-error">{{ error }}</p>
    <label class="form-control">处理方式
      <select v-model="action" class="select select-bordered mt-1 w-full" @change="publish">
        <option value="keep">保留当前匹配；未匹配则只保留原名</option>
        <option value="unassigned">不关联组织</option>
        <option v-if="reportName" value="select">选择 / 更换当前记录的组织</option>
        <option v-if="reportName" value="alias">将报告原名补充为本来源别名</option>
        <option v-if="reportName" value="create">新建本地组织并关联当前记录</option>
      </select>
    </label>
    <template v-if="['select', 'alias'].includes(action)">
      <div class="flex min-w-0 gap-2"><input v-model="query" class="input input-bordered min-w-0 flex-1" maxlength="200" placeholder="搜索组织名称或编号" @keydown.enter.prevent="search" /><button type="button" class="btn btn-outline" :disabled="loading" @click="search">搜索</button></div>
      <label class="form-control">目标组织<select v-model="actorId" class="select select-bordered mt-1 w-full" required @change="publish"><option value="" disabled>请选择组织</option><option v-for="item in options" :key="item.attack_id" :value="item.attack_id">{{ item.name }} · {{ item.attack_id }}{{ item.dataset_version === 'local-reviewed' ? '（本地）' : '' }}</option></select></label>
      <p class="text-xs opacity-65">{{ action === 'alias' ? '接纳时保存本来源的名称对应关系；其他来源不受影响。' : '仅确认当前提议的组织，不修改别名关系。' }}</p>
    </template>
    <label v-if="action === 'create'" class="form-control">本地组织名称<input v-model="name" class="input input-bordered mt-1 w-full" maxlength="200" required @input="publish" /></label>
    <p class="text-xs opacity-65">上述更改在提交“接纳”时一起保存；拒绝提议不会补别名或创建组织。</p>
  </fieldset>
</template>
