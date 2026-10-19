<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import http from '../utils/http'
import { formatDateTime } from '../utils/systemTime'
import { sourceKinds, defaultIntervals, states, intelError, newSource, sourcePayload, settingsPayload, originLabel, safeReference } from '../utils/threatIntel'
const tabs = { sources: '来源', records: 'IOC 库', review: '审核', articles: '文章', entities: 'MITRE 基准库', mappings: '名称映射', jobs: '同步作业' }
const tab = ref('sources'), sources = ref([]), records = ref([]), articles = ref([]), entities = ref([]), jobs = ref([]), mappings = ref({ unmapped: [], mappings: [] })
const error = ref(''), notice = ref(''), loading = ref(false), busy = ref(false), total = ref(0), offset = ref(0), query = ref(''), recordStatus = ref('approved'), entityKind = ref('actor')
const settings = ref({ ai_enabled: false, ai_endpoint: 'https://api.openai.com/v1/chat/completions', ai_model: '', ai_key_env: 'NM_INTEL_AI_API_KEY', credential: '', clear_credential: false })
const settingsRevision = ref(0), aiCredential = ref(false), aiDatabaseCredential = ref(false), aiCredentialSource = ref('none')
const sourceDialog = ref(null), sourceForm = ref(newSource()), hostsText = ref('')
const importDialog = ref(null), importSource = ref(null), importFile = ref(null), importFileInput = ref(null), uploadProgress = ref(0)
const reviewDialog = ref(null), selected = ref(null), reviewDecision = ref('approved'), reason = ref(''), article = ref(null), articleLoading = ref(false)
const articleError = ref('')
const reviewBlocked = computed(() => busy.value || articleLoading.value || !reason.value.trim() || (selected.value?.origin === 'ai' && reviewDecision.value === 'approved' && !article.value?.body?.trim()))
const entityDialog = ref(null), entityDetail = ref(null), entityLoading = ref(false)
const mappingDialog = ref(null), mappingForm = ref({ source_id: '', name: '', attack_id: '' }), candidateQuery = ref(''), candidates = ref([])
const requests = new AbortController()
let timer, disposed = false, tabVersion = 0, articleVersion = 0, candidateVersion = 0, entityVersion = 0
function fail(e) { if (!disposed && e.code !== 'ERR_CANCELED') error.value = intelError(e) }
async function loadSources() { const r = await http.get('/api/intel/sources', { signal: requests.signal }); if (!disposed) sources.value = r.data.data.items }
async function loadSettings() { const r = await http.get('/api/intel/settings', { signal: requests.signal }); if (!disposed) { settings.value = { ...r.data.data.settings, credential: '', clear_credential: false }; settingsRevision.value = r.data.data.revision; aiCredential.value = r.data.data.credential_configured; aiDatabaseCredential.value = r.data.data.database_credential_configured; aiCredentialSource.value = r.data.data.credential_source } }
async function refresh() {
  const version = ++tabVersion, current = tab.value
  loading.value = true; error.value = ''
  try {
    let path, params
    if (current === 'sources') { await loadSources(); return }
    if (current === 'records' || current === 'review') { path = '/api/intel/records'; params = { status: current === 'review' ? 'pending' : recordStatus.value, q: query.value, offset: offset.value } }
    else if (current === 'entities') { path = '/api/intel/entities'; params = { q: query.value, kind: entityKind.value } }
    else path = `/api/intel/${current}`
    const r = await http.get(path, { params, signal: requests.signal })
    if (disposed || version !== tabVersion) return
    const data = r.data.data
    if (current === 'records' || current === 'review') { records.value = data.items; total.value = data.total }
    else if (current === 'articles') articles.value = data.items
    else if (current === 'entities') entities.value = data.items
    else if (current === 'mappings') mappings.value = data
    else if (current === 'jobs') jobs.value = data.items
  } catch (e) { if (version === tabVersion) fail(e) } finally { if (version === tabVersion) loading.value = false }
}
function changeTab(value) { tab.value = value; query.value = ''; offset.value = 0; refresh() }
async function saveSettings() {
  busy.value = true; error.value = ''; notice.value = ''
  try { await http.put('/api/intel/settings', { settings: settingsPayload(settings.value), expected_revision: settingsRevision.value }); settings.value.credential = ''; settings.value.clear_credential = false; await loadSettings(); notice.value = 'AI 配置已保存。可信来源同步独立运行，AI 提议始终需要人工审核。' } catch (e) { fail(e) } finally { busy.value = false }
}
function editSource(source = null) { sourceForm.value = source ? { ...newSource(), ...source } : newSource(); hostsText.value = (source?.allowed_hosts || []).join('\n'); sourceDialog.value?.showModal() }
function clearSourceCredential() { sourceForm.value.credential = ''; sourceForm.value.clear_credential = false }
function kindChanged() { sourceForm.value.interval_seconds = defaultIntervals[sourceForm.value.kind]; if (sourceForm.value.kind === 'threatfox_export') { sourceForm.value.transport = 'upload'; sourceForm.value.location = ''; sourceForm.value.auth_env = ''; clearSourceCredential(); hostsText.value = '' } }
function openImport(source) { importSource.value = source; importFile.value = null; uploadProgress.value = 0; if (importFileInput.value) importFileInput.value.value = ''; importDialog.value?.showModal() }
async function uploadImport() {
  if (!importSource.value || !importFile.value || busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await http.post(`/api/intel/sources/${importSource.value.id}/import`, importFile.value, { params: { expected_revision: importSource.value.revision }, headers: { 'Content-Type': 'application/octet-stream' }, signal: requests.signal, onUploadProgress: e => { if (!disposed && e.total) uploadProgress.value = Math.round(e.loaded * 100 / e.total) } })
    importDialog.value?.close(); importFile.value = null; await loadSources(); notice.value = '离线文件已上传，后台将先校验再分批导入。ThreatFox 增量更新继续使用 API。'
  } catch (e) { fail(e) } finally { busy.value = false }
}
async function saveSource() {
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const payload = sourcePayload(sourceForm.value, hostsText.value)
    if (sourceForm.value.id) await http.put(`/api/intel/sources/${sourceForm.value.id}`, payload)
    else await http.post('/api/intel/sources', payload)
    sourceDialog.value?.close(); clearSourceCredential(); await loadSources(); notice.value = payload.transport === 'upload' || payload.kind === 'threatfox_export' ? '离线来源已保存，请手动上传文件或从本地导入。' : '来源已保存，将按检查周期更新；AI 提议的人工审核规则不受来源设置影响。'
  } catch (e) { fail(e) } finally { busy.value = false }
}
async function sync(source) {
  busy.value = true; error.value = ''
  try { await http.post(`/api/intel/sources/${source.id}/sync`); notice.value = '同步作业已入队，可在同步作业页查看结果。'; await loadSources() } catch (e) { fail(e) } finally { busy.value = false }
}
async function openReview(record, decision = 'approved') {
  selected.value = record; reviewDecision.value = decision; reason.value = ''; reviewDialog.value?.showModal()
  await loadReviewArticle()
}
async function loadReviewArticle() {
  const version = ++articleVersion
  const record = selected.value
  article.value = null; articleError.value = ''; articleLoading.value = false
  if (!record?.article_id) {
    if (record?.origin === 'ai') articleError.value = 'AI 提议缺少文章快照，暂不能接纳。'
    return
  }
  articleLoading.value = true
  try {
    const r = await http.get(`/api/intel/articles/${record.article_id}`, { signal: requests.signal })
    if (disposed || version !== articleVersion) return
    const snapshot = r.data.data
    if (typeof snapshot?.body !== 'string' || !snapshot.body.trim()) articleError.value = '文章快照没有有效正文，暂不能接纳 AI 提议。'
    else article.value = snapshot
  } catch (e) { if (version === articleVersion) { articleError.value = '文章快照加载失败，请重试后再接纳。'; fail(e) } }
  finally { if (version === articleVersion) articleLoading.value = false }
}
async function submitReview() {
  if (!selected.value || reviewBlocked.value) return
  busy.value = true; error.value = ''
  try { await http.post(`/api/intel/records/${selected.value.id}/review`, { content_hash: selected.value.content_hash, decision: reviewDecision.value, reason: reason.value.trim() }); reviewDialog.value?.close(); notice.value = '审核决定已保存，标记已按有效证据更新。'; await refresh() } catch (e) { fail(e) } finally { busy.value = false }
}
async function retryArticle(row) { busy.value = true; try { await http.post(`/api/intel/articles/${row.id}/retry`); await refresh() } catch (e) { fail(e) } finally { busy.value = false } }
function openMapping(row) { mappingForm.value = { source_id: row.source_id, name: row.name, kind: row.kind || 'actor', attack_id: '' }; candidateQuery.value = row.name; candidates.value = []; mappingDialog.value?.showModal(); searchCandidates() }
async function searchCandidates() { const version = ++candidateVersion; try { const r = await http.get('/api/intel/entities', { params: { kind: mappingForm.value.kind || 'actor', q: candidateQuery.value }, signal: requests.signal }); if (!disposed && version === candidateVersion) candidates.value = r.data.data.items.filter(e => e.active) } catch (e) { if (version === candidateVersion) fail(e) } }
async function saveMapping() { busy.value = true; try { await http.post('/api/intel/mappings', mappingForm.value); mappingDialog.value?.close(); await refresh(); notice.value = '本来源的名称对应关系已保存。' } catch (e) { fail(e) } finally { busy.value = false } }
async function deleteMapping(row) { busy.value = true; try { await http.delete(`/api/intel/mappings/${row.id}`, { params: { attack_id: row.attack_id } }); await refresh(); notice.value = '名称映射已撤销，已接纳 IOC 的恶意判定保留。' } catch (e) { fail(e) } finally { busy.value = false } }
async function showEntity(row) { const version = ++entityVersion; entityDetail.value = null; entityLoading.value = true; entityDialog.value?.showModal(); try { const r = await http.get(`/api/intel/entities/${row.attack_id}`, { signal: requests.signal }); if (!disposed && version === entityVersion) entityDetail.value = r.data.data } catch (e) { if (version === entityVersion) fail(e) } finally { if (version === entityVersion) entityLoading.value = false } }
async function poll() {
  if (disposed) return
  if (!busy.value && !loading.value && document.visibilityState !== 'hidden' && ['sources', 'jobs', 'articles'].includes(tab.value)) await refresh()
  if (!disposed) timer = setTimeout(poll, 5000)
}
onMounted(async () => { try { await Promise.all([loadSettings(), loadSources()]); await refresh() } catch (e) { fail(e) } if (!disposed) timer = setTimeout(poll, 5000) })
onBeforeUnmount(() => { disposed = true; tabVersion++; articleVersion++; settings.value.credential = ''; clearSourceCredential(); importFile.value = null; requests.abort(); clearTimeout(timer) })
</script>

<template>
  <main class="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
    <div><h1 class="text-2xl font-semibold">威胁情报与自动标记</h1><p class="mt-2 text-sm opacity-65">可信来源的 IOC 默认直接接纳；AI 提取作为补充，所有提议均须人工审核后生效。</p></div>
    <div v-if="error" role="alert" class="alert alert-error">{{ error }}</div>
    <div v-if="notice" role="status" class="alert alert-info">{{ notice }}</div>
    <form class="card border border-base-300 bg-base-100 p-4 space-y-3" @submit.prevent="saveSettings">
      <div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-semibold">AI 文章提取</h2><label class="flex items-center gap-2 text-sm"><input v-model="settings.ai_enabled" type="checkbox" class="toggle toggle-sm" />启用 AI 提取</label></div>
      <p class="text-sm opacity-65">{{ settings.ai_enabled ? '启用后处理 RSS 文章队列。' : '当前暂停 AI 提取，可信 IOC 同步与自动标记继续运行。' }}AI 人工审核为固定规则，无法关闭。</p>
      <div class="grid gap-3 md:grid-cols-3">
        <label class="form-control text-sm">兼容接口地址<input v-model="settings.ai_endpoint" class="input input-bordered mt-1 w-full" type="url" required /></label>
        <label class="form-control text-sm">模型名称<input v-model="settings.ai_model" class="input input-bordered mt-1 w-full" :required="settings.ai_enabled" maxlength="100" /></label>
        <label class="form-control text-sm">环境变量备用来源（可选）<input v-model="settings.ai_key_env" class="input input-bordered mt-1 w-full" placeholder="NM_INTEL_AI_API_KEY" /></label>
      </div>
      <label class="form-control text-sm">数据库加密凭据（留空保留已保存值）<input v-model="settings.credential" type="password" autocomplete="new-password" maxlength="8192" class="input input-bordered mt-1 w-full" :disabled="settings.clear_credential" placeholder="输入原始 API Key，保存后不回显" /></label>
      <label v-if="aiDatabaseCredential" class="flex items-center gap-2 text-sm"><input v-model="settings.clear_credential" type="checkbox" class="checkbox checkbox-sm" />清除已保存的数据库凭据</label>
      <div class="flex flex-wrap items-center justify-between gap-3"><p class="text-xs opacity-60">凭据：{{ aiCredential ? (aiCredentialSource === 'database' ? '数据库加密存储' : '环境变量') : '未配置' }}。优先使用数据库凭据；未保存时使用环境变量。明文不会回显。</p><button class="btn btn-primary btn-sm" :disabled="busy || !settingsRevision">保存 AI 设置</button></div>
    </form>
    <div role="tablist" class="tabs tabs-border overflow-x-auto flex-nowrap"><button v-for="(label, key) in tabs" :key="key" type="button" role="tab" class="tab whitespace-nowrap" :aria-selected="tab === key" :class="{ 'tab-active': tab === key }" @click="changeTab(key)">{{ label }}</button></div>
    <div class="flex flex-wrap items-center gap-3">
      <button type="button" class="btn btn-sm" :disabled="loading" @click="refresh">刷新</button>
      <button v-if="tab === 'sources'" type="button" class="btn btn-primary btn-sm" @click="editSource()">添加来源</button>
      <form v-if="['records','review','entities'].includes(tab)" class="flex flex-wrap gap-2" @submit.prevent="offset = 0; refresh()">
        <input v-model="query" class="input input-bordered input-sm" maxlength="200" placeholder="IOC、软件或组织名称" aria-label="情报搜索" />
        <select v-if="tab === 'records'" v-model="recordStatus" class="select select-bordered select-sm" aria-label="接纳状态"><option v-for="state in ['approved','expired','revoked','rejected','superseded']" :key="state" :value="state">{{ states[state] }}</option></select>
        <select v-if="tab === 'entities'" v-model="entityKind" class="select select-bordered select-sm" aria-label="基准实体类型"><option value="actor">组织</option><option value="software">软件</option><option value="technique">攻击技术</option></select>
        <button class="btn btn-sm">搜索</button>
      </form>
      <span v-if="loading" class="loading loading-spinner loading-sm" aria-label="加载中"></span>
    </div>
    <div class="card border border-base-300 bg-base-100 overflow-x-auto">
      <table v-if="tab === 'sources'" class="table table-sm"><thead><tr><th>来源</th><th>位置与格式</th><th>接纳策略</th><th>检查周期</th><th>最近作业</th><th>操作</th></tr></thead><tbody>
        <tr v-for="s in sources" :key="s.id"><td><strong>{{ s.name }}</strong><p class="text-xs opacity-60">{{ s.enabled ? '已启用' : '已停用' }}</p></td><td><p>{{ sourceKinds[s.kind] }} · {{ s.transport === 'upload' ? '离线上传' : s.transport === 'local' ? '本地文件' : '远程 HTTPS' }}</p><p class="mt-1 max-w-md break-all text-xs opacity-60">{{ s.location }}</p><p v-if="s.auth_env || s.credential_configured" class="text-xs">凭据 {{ s.credential_source === 'database' ? '数据库加密存储' : s.credential_configured ? '环境变量' : '未配置' }}</p></td><td>{{ s.kind === 'rss' ? 'AI 固定人工审核' : s.kind === 'mitre_stix' ? '规范化基准库' : s.require_review ? '人工审核后接纳' : '可信 IOC 直接接纳' }}</td><td>{{ s.transport === 'upload' || s.kind === 'threatfox_export' ? '手动导入，不定时拉取' : `${s.interval_seconds} 秒` }}<p class="text-xs opacity-60">有效期 {{ s.expiry_months ? `${s.expiry_months} 个月` : '不设置本地期限' }}</p><p v-if="s.import_status" class="text-xs">{{ states[s.import_status.stage] }} · {{ s.import_status.processed }}/{{ s.import_status.total }}</p></td><td>{{ states[s.last_run?.status] || '尚未同步' }}<p v-if="s.last_run?.error_code" class="max-w-xs text-xs text-error">{{ intelError(s.last_run.error_code) }}</p></td><td><div class="flex gap-2"><button class="btn btn-ghost btn-xs" @click="editSource(s)">编辑</button><button v-if="s.transport === 'upload'" class="btn btn-primary btn-xs" :disabled="busy || !s.enabled" @click="openImport(s)">上传离线文件</button><button v-if="s.transport !== 'upload' || ['downloaded','ready'].includes(s.import_status?.stage)" class="btn btn-outline btn-xs" :disabled="busy || !s.enabled" @click="sync(s)">{{ s.transport === 'upload' ? '继续导入' : '立即同步' }}</button></div></td></tr>
        <tr v-if="!sources.length"><td colspan="6" class="py-8 text-center opacity-60">暂无来源。</td></tr>
      </tbody></table>
      <table v-else-if="tab === 'records' || tab === 'review'" class="table table-sm"><thead><tr><th>IOC</th><th>来源</th><th>上下文与证据</th><th>状态</th><th>操作</th></tr></thead><tbody>
        <tr v-for="r in records" :key="r.id"><td><span class="badge badge-outline badge-xs">{{ r.type }}</span><p class="mt-1 max-w-xs break-all font-mono">{{ r.value }}</p><span class="badge badge-xs" :class="r.payload.verdict === 'malicious' ? 'badge-error' : 'badge-warning'">{{ r.payload.verdict === 'malicious' ? '恶意' : '可疑' }}</span></td><td>{{ r.source_name }}<p class="text-xs opacity-60">{{ originLabel(r) }}</p></td><td class="max-w-md"><p v-if="r.payload.actor_name">组织原名：{{ r.payload.actor_name }} <span v-if="r.actor_id">（{{ r.actor_id }}）</span></p><p v-if="r.payload.malware">软件：{{ r.payload.malware }}</p><p v-if="r.payload.confidence != null">来源置信度：{{ r.payload.confidence }}</p><p v-if="r.payload.evidence" class="mt-1 line-clamp-3 break-words text-xs opacity-70">{{ r.payload.evidence }}</p></td><td>{{ states[r.status] }}<p v-if="r.valid_until" class="text-xs">有效至 {{ formatDateTime(r.valid_until) }}</p></td><td><button v-if="r.status === 'pending'" class="btn btn-primary btn-xs" @click="openReview(r)">审核</button><button v-else-if="['approved','expired'].includes(r.status)" class="btn btn-outline btn-xs" @click="openReview(r, 'revoked')">证据 / 撤销</button></td></tr>
        <tr v-if="!records.length"><td colspan="5" class="py-8 text-center opacity-60">{{ tab === 'review' ? '暂无待审提议。AI 关闭时不会产生新的 AI 提议。' : '暂无匹配记录。' }}</td></tr>
      </tbody></table>
      <table v-else-if="tab === 'articles'" class="table table-sm"><thead><tr><th>文章</th><th>来源</th><th>提取状态</th><th>操作</th></tr></thead><tbody><tr v-for="r in articles" :key="r.id"><td><a v-if="safeReference(r.url)" :href="safeReference(r.url)" target="_blank" rel="noopener noreferrer" class="link">{{ r.title || r.url }}</a><p class="text-xs opacity-60">{{ formatDateTime(r.created_at) }}</p></td><td>{{ r.source_name }}</td><td>{{ states[r.status] }}<p v-if="r.error_code" class="text-xs text-error">{{ intelError(r.error_code) }}</p></td><td><button v-if="['failed','cancelled','proposed'].includes(r.status)" class="btn btn-xs" :disabled="busy || !settings.ai_enabled" @click="retryArticle(r)">{{ r.status === 'proposed' ? '重新提取' : '重试提取' }}</button></td></tr><tr v-if="!articles.length"><td colspan="4" class="py-8 text-center opacity-60">暂无文章。</td></tr></tbody></table>
      <table v-else-if="tab === 'entities'" class="table table-sm"><thead><tr><th>ATT&amp;CK ID</th><th>标准名称</th><th>关联名称</th><th>状态</th></tr></thead><tbody><tr v-for="r in entities" :key="r.attack_id"><td><button type="button" class="link font-mono" @click="showEntity(r)">{{ r.attack_id }}</button></td><td>{{ r.name }}</td><td class="max-w-lg">{{ r.aliases.join('、') || '—' }}<p class="text-xs opacity-60">关联名称可能仅部分重叠，不自动作为等价别名。</p></td><td>{{ r.active ? '有效' : '已撤销 / 弃用' }}</td></tr><tr v-if="!entities.length"><td colspan="4" class="py-8 text-center opacity-60">暂无结果；首次使用请先同步 MITRE 来源。</td></tr></tbody></table>
      <div v-else-if="tab === 'mappings'" class="p-4 space-y-5"><div><h2 class="font-semibold">未映射组织与软件名称</h2><p class="mt-1 text-sm opacity-65">只允许对应到已有有效 MITRE 组织或软件；未映射名称不会自动创建实体。</p><div v-for="r in mappings.unmapped" :key="`${r.source_id}:${r.kind}:${r.name}`" class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 py-3"><span>{{ r.kind === 'software' ? '软件 / 家族' : '组织' }} · {{ r.name }} · {{ r.source_name }} · {{ r.count }} 条</span><button class="btn btn-outline btn-xs" @click="openMapping(r)">核对对应关系</button></div><p v-if="!mappings.unmapped.length" class="py-4 text-sm opacity-60">暂无未映射名称。</p></div><div><h2 class="font-semibold">已确认的来源名称映射</h2><div v-for="r in mappings.mappings" :key="r.id" class="flex items-center justify-between gap-3 py-2 text-sm"><span>{{ r.name }} → {{ r.canonical_name }}（{{ r.attack_id }}）</span><button type="button" class="btn btn-ghost btn-xs" :disabled="busy" @click="deleteMapping(r)">撤销映射</button></div></div></div>
      <table v-else-if="tab === 'jobs'" class="table table-sm"><thead><tr><th>来源</th><th>时间</th><th>状态</th><th>结果</th></tr></thead><tbody><tr v-for="r in jobs" :key="r.id"><td>{{ r.source_name }}</td><td>{{ formatDateTime(r.created_at) }}</td><td>{{ states[r.status] }}</td><td><p v-if="r.error_code" class="text-error">{{ intelError(r.error_code) }}</p><code class="text-xs break-all">{{ JSON.stringify(r.summary) }}</code></td></tr><tr v-if="!jobs.length"><td colspan="4" class="py-8 text-center opacity-60">暂无作业。</td></tr></tbody></table>
    </div>
    <div v-if="['records','review'].includes(tab) && (total > 50 || offset)" class="flex justify-end items-center gap-3 text-sm"><span>共 {{ total }} 条</span><button class="btn btn-sm" :disabled="loading || offset === 0" @click="offset = Math.max(0, offset - 50); refresh()">上一页</button><button class="btn btn-sm" :disabled="loading || offset + 50 >= total" @click="offset += 50; refresh()">下一页</button></div>

    <dialog ref="importDialog" class="modal" @cancel="busy && $event.preventDefault()" @close="importFile = null"><form class="modal-box space-y-4" @submit.prevent="uploadImport"><h2 class="text-lg font-semibold">上传离线历史文件</h2><p class="text-sm">{{ importSource?.name }} · 支持 JSON、CSV 和单文件 ZIP。只用于按需补齐历史，持续更新仍使用 API。</p><input ref="importFileInput" type="file" accept=".json,.csv,.zip" class="file-input file-input-bordered w-full" required :disabled="busy" @change="importFile = $event.target.files?.[0] || null" /><p class="text-xs opacity-65">上传最多 512 MiB；解压内容与规范化结果各最多 2 GiB。先完整校验，再分批入库。可信来源沿用接纳策略，历史数据按观察时间自动判断是否过期。</p><progress v-if="busy" class="progress progress-primary w-full" :value="uploadProgress" max="100"></progress><div class="modal-action"><button type="button" class="btn btn-ghost" :disabled="busy" @click="importDialog?.close()">取消</button><button class="btn btn-primary" :disabled="busy || !importFile">上传并导入</button></div></form></dialog>

    <dialog ref="sourceDialog" class="modal" @close="clearSourceCredential"><form class="modal-box max-w-2xl space-y-4" @submit.prevent="saveSource"><h2 class="text-lg font-semibold">{{ sourceForm.id ? '编辑来源' : '添加来源' }}</h2>
      <label class="form-control text-sm">来源名称<input v-model="sourceForm.name" class="input input-bordered mt-1 w-full" required maxlength="100" /></label>
      <div class="grid gap-3 sm:grid-cols-2"><label class="form-control text-sm">数据格式<select v-model="sourceForm.kind" class="select select-bordered mt-1 w-full" @change="kindChanged"><option v-for="(label, kind) in sourceKinds" :key="kind" :value="kind">{{ label }}</option></select></label><label class="form-control text-sm">获取方式<select v-model="sourceForm.transport" class="select select-bordered mt-1 w-full"><option value="https" :disabled="sourceForm.kind === 'threatfox_export'">远程 HTTPS 拉取</option><option value="local">本地文件</option><option v-if="['json','lines','threatfox_export'].includes(sourceForm.kind)" value="upload">离线上传文件</option></select></label></div>
      <label v-if="sourceForm.transport !== 'upload'" class="form-control text-sm">{{ sourceForm.transport === 'local' ? '相对 IOC 根目录的文件路径' : '远程地址' }}<input v-model="sourceForm.location" class="input input-bordered mt-1 w-full" required maxlength="2048" :placeholder="sourceForm.transport === 'local' ? 'vendor/feed.json' : 'https://…'" /></label>
      <label v-if="sourceForm.transport === 'https' || sourceForm.kind === 'rss'" class="form-control text-sm">允许的完整域名（每行一个）<textarea v-model="hostsText" class="textarea textarea-bordered mt-1 w-full" rows="3" required placeholder="raw.githubusercontent.com"></textarea></label>
      <div class="grid gap-3 sm:grid-cols-2"><label class="form-control text-sm" v-if="sourceForm.transport !== 'upload' && sourceForm.kind !== 'threatfox_export'">检查周期（秒）<input v-model="sourceForm.interval_seconds" type="number" min="60" max="2592000" class="input input-bordered mt-1 w-full" required /><span class="mt-1 text-xs opacity-60">该格式默认 {{ defaultIntervals[sourceForm.kind] }} 秒，可自行调整。</span></label><label v-if="sourceForm.transport === 'https'" class="form-control text-sm">凭据环境变量（可选）<input v-model="sourceForm.auth_env" class="input input-bordered mt-1 w-full" placeholder="NM_INTEL_…" /></label></div>
      <template v-if="sourceForm.transport === 'https'"><label class="form-control text-sm">数据库加密凭据（留空保留）<input v-model="sourceForm.credential" type="password" autocomplete="new-password" maxlength="8192" class="input input-bordered mt-1 w-full" :disabled="sourceForm.clear_credential" placeholder="Auth-Key 或完整 Authorization 值" /></label><label v-if="sourceForm.database_credential_configured" class="flex items-center gap-2 text-sm"><input v-model="sourceForm.clear_credential" type="checkbox" class="checkbox checkbox-sm" />清除已保存的数据库凭据</label><p class="text-xs opacity-65">{{ sourceForm.database_credential_configured ? '已保存数据库加密凭据。' : '尚未保存数据库凭据。' }}优先使用数据库凭据，留空保留，清除后使用环境变量备用来源。ThreatFox 填写原始 Auth-Key；其他格式填写完整 Authorization 值。</p></template>
      <label class="flex items-center gap-2 text-sm"><input v-model="sourceForm.enabled" type="checkbox" class="checkbox checkbox-sm" />启用{{ sourceForm.transport === 'upload' || sourceForm.kind === 'threatfox_export' ? '该离线来源' : '自动检查' }}</label>
      <label class="form-control text-sm">自动情报有效期（月）<input v-model="sourceForm.expiry_months" type="number" min="0" max="120" class="input input-bordered mt-1 w-full" required /><span class="mt-1 text-xs opacity-60">默认 6 个月，按最后观察时间计算，缺失时用首次观察或首次入库时间。0 不设置本地有效期，来源明确到期仍生效。</span></label>
      <label v-if="!['rss','mitre_stix'].includes(sourceForm.kind)" class="flex items-center gap-2 text-sm"><input v-model="sourceForm.require_review" type="checkbox" class="checkbox checkbox-sm" />该来源的结构化 IOC 需要人工审核</label>
      <p class="text-xs opacity-65">可信官方 IOC 默认直接接纳，不受置信度或来源数量限制。RSS 的 AI 提取结果固定需要人工审核。停用来源会停止后续同步，已有结论可在 IOC 库撤销。</p>
      <div class="modal-action"><button type="button" class="btn btn-ghost" @click="sourceDialog?.close()">取消</button><button class="btn btn-primary" :disabled="busy">保存来源</button></div>
    </form><form method="dialog" class="modal-backdrop"><button>关闭</button></form></dialog>

    <dialog ref="reviewDialog" class="modal"><form class="modal-box max-w-4xl space-y-4" @submit.prevent="submitReview"><h2 class="text-lg font-semibold">{{ selected?.status === 'pending' ? '审核 IOC 提议' : '证据与撤销' }}</h2>
      <template v-if="selected"><p class="break-all font-mono">{{ selected.type }} · {{ selected.value }}</p><p class="text-sm">{{ selected.source_name }} · {{ originLabel(selected) }}</p><div class="grid gap-4 md:grid-cols-2"><div class="space-y-3"><h3 class="font-semibold">提议与支持证据</h3><p v-if="selected.payload.actor_name">组织原名：{{ selected.payload.actor_name }}；标准 ID：{{ selected.actor_id || '未映射' }}</p><p v-if="selected.payload.malware">软件：{{ selected.payload.malware }}</p><p v-if="selected.payload.techniques?.length">报告技术：{{ selected.payload.techniques.join('、') }}</p><p v-if="selected.payload.victim_industries?.length">受害行业：{{ selected.payload.victim_industries.join('、') }}</p><p v-if="selected.payload.victim_countries?.length">受害地区：{{ selected.payload.victim_countries.join('、') }}</p><blockquote class="border-l-2 border-base-300 pl-3 whitespace-pre-wrap break-words text-sm">{{ selected.payload.evidence || '结构化来源记录' }}</blockquote><a v-if="safeReference(selected.payload.reference)" :href="safeReference(selected.payload.reference)" class="link text-sm" target="_blank" rel="noopener noreferrer">查看来源</a><p class="text-xs opacity-60 break-all">提议版本 {{ selected.content_hash }}</p></div><div><h3 class="font-semibold">文章快照</h3><span v-if="articleLoading" class="loading loading-spinner loading-sm"></span><p v-else-if="article?.body" class="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-base-200 p-3 text-sm">{{ article.body }}</p><div v-else-if="selected.origin === 'ai'" class="mt-2 space-y-2"><p role="alert" class="text-sm text-error">{{ articleError || '请先加载原文快照，才能接纳 AI 提议。' }}</p><button v-if="selected.article_id" type="button" class="btn btn-outline btn-sm" :disabled="busy" @click="loadReviewArticle">重试加载原文</button></div><p v-else class="mt-2 text-sm opacity-65">该记录来自结构化 IOC，无 AI 文章快照。</p></div></div>
        <label v-if="selected.status === 'pending'" class="form-control text-sm">审核决定<select v-model="reviewDecision" class="select select-bordered mt-1 w-full"><option value="approved">接纳该 IOC 及所列事实</option><option value="rejected">拒绝该提议</option></select></label>
        <label class="form-control text-sm">{{ reviewDecision === 'revoked' ? '撤销原因' : '审核说明' }}<textarea v-model="reason" class="textarea textarea-bordered mt-1 w-full" maxlength="1000" required rows="2"></textarea></label>
        <p v-if="selected.origin === 'ai'" class="text-xs opacity-65">请核对 IOC 角色、归因及证据是否明确。受害目标不能误标为攻击基础设施；接纳后才进入有效 IOC 库。</p>
      </template>
      <div class="modal-action"><button type="button" class="btn btn-ghost" @click="reviewDialog?.close()">关闭</button><button class="btn" :class="reviewDecision === 'approved' ? 'btn-primary' : 'btn-error'" :disabled="reviewBlocked">{{ reviewDecision === 'revoked' ? '撤销这条证据' : '提交审核决定' }}</button></div>
    </form><form method="dialog" class="modal-backdrop"><button>关闭</button></form></dialog>

    <dialog ref="entityDialog" class="modal"><div class="modal-box max-w-3xl space-y-3"><h2 class="text-lg font-semibold">MITRE 关系与来源</h2><span v-if="entityLoading" class="loading loading-spinner"></span><template v-if="entityDetail"><h3 class="font-semibold">{{ entityDetail.entity.name }}</h3><p class="text-sm whitespace-pre-wrap break-words">{{ entityDetail.entity.description }}</p><p class="text-xs opacity-65">以下是 MITRE 已报告的使用或技术关系，不代表任何当前 IOC 的组织归因。</p><div class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>关系</th><th>方向</th><th>实体</th></tr></thead><tbody><tr v-for="r in entityDetail.relationships" :key="`${r.attack_id}:${r.direction}:${r.relation}`"><td>{{ r.relation }}</td><td>{{ r.direction === 'incoming' ? '指向本实体' : '本实体指向' }}</td><td>{{ r.name }}（{{ r.attack_id }}）</td></tr></tbody></table></div></template><div class="modal-action"><button type="button" class="btn" @click="entityDialog?.close()">关闭</button></div></div><form method="dialog" class="modal-backdrop"><button>关闭</button></form></dialog>
    <dialog ref="mappingDialog" class="modal"><form class="modal-box max-w-2xl space-y-4" @submit.prevent="saveMapping"><h2 class="text-lg font-semibold">核对来源名称与 MITRE 实体</h2><p>原名：{{ mappingForm.name }}</p><div class="flex gap-2"><input v-model="candidateQuery" class="input input-bordered grow" aria-label="搜索 MITRE 候选组织" /><button type="button" class="btn" @click="searchCandidates">搜索候选</button></div><label class="form-control text-sm">确认对应实体<select v-model="mappingForm.attack_id" class="select select-bordered mt-1 w-full" required><option disabled value="">请选择已核实的 MITRE 实体</option><option v-for="r in candidates" :key="r.attack_id" :value="r.attack_id">{{ r.attack_id }} · {{ r.name }}</option></select></label><p class="text-sm opacity-65">MITRE 关联名称可能仅部分重叠。此操作表示你已核实该来源的这个名称与所选实体对应，不会创建新实体；软件映射不产生组织归因。</p><div class="modal-action"><button type="button" class="btn btn-ghost" @click="mappingDialog?.close()">取消</button><button class="btn btn-primary" :disabled="busy || !mappingForm.attack_id">保存已核实映射</button></div></form><form method="dialog" class="modal-backdrop"><button>关闭</button></form></dialog>
  </main>
</template>
