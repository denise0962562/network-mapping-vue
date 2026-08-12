<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import http from './utils/http'

const STORAGE_KEY = 'network_mapping_search_history'
const MAX_HISTORY = 12
const PAGE_SIZE = 50

const searchInput = ref('')
const searchHistory = ref([])
const showHistory = ref(false)
const searchBoxRef = ref(null)
const loading = ref(false)
const errorMessage = ref('')
const searchResult = ref(null)
const activeSearch = ref(null)
const offset = ref(0)
const syntaxDialogRef = ref(null)

const typeLabels = {
  ip: 'IP 地址',
  network: 'CIDR 网段',
  port: '端口',
  service: '服务',
  banner: 'Banner',
}

const supportedSyntax = '支持：IP、CIDR，或 port:443、service:https、banner:nginx'
const currentTypeLabel = computed(() => activeSearch.value ? typeLabels[activeSearch.value.type] : '')

function openSyntaxDialog() {
  syntaxDialogRef.value?.showModal()
}

function closeSyntaxDialog() {
  syntaxDialogRef.value?.close()
}

function isIpv4(value) {
  const parts = value.split('.')
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function isLikelyIpv6(value) {
  return value.includes(':') && /^[0-9a-fA-F:]+$/.test(value)
}

function detectSearchType(value) {
  const input = value.trim()
  if (!input) return { error: '请输入搜索内容' }

  const prefixed = input.match(/^(port|service|banner)\s*:\s*(.+)$/i)
  if (prefixed) {
    const type = prefixed[1].toLowerCase()
    const query = prefixed[2].trim()
    if (!query) return { error: '搜索值不能为空' }
    if (type === 'port' && !/^\d+$/.test(query)) return { error: '端口必须是数字，例如 port:443' }
    return { type, query }
  }

  const slashIndex = input.lastIndexOf('/')
  if (slashIndex > 0) {
    const ipPart = input.slice(0, slashIndex)
    if (isIpv4(ipPart) || isLikelyIpv6(ipPart)) return { type: 'network', query: input }
  }

  if (isIpv4(input) || isLikelyIpv6(input)) return { type: 'ip', query: input }
  return { error: `无法识别搜索类型。${supportedSyntax}` }
}

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    searchHistory.value = Array.isArray(parsed)
      ? parsed.map((item) => typeof item === 'string' ? { keyword: item } : item).filter((item) => item.keyword)
      : []
  } catch {
    searchHistory.value = []
  }
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(searchHistory.value))
}

function pushHistory(keyword, type) {
  searchHistory.value = [{ keyword, type }, ...searchHistory.value.filter((item) => item.keyword !== keyword)].slice(0, MAX_HISTORY)
  saveHistory()
}

function clearHistory() {
  searchHistory.value = []
  saveHistory()
}

function pickHistory(item) {
  searchInput.value = item.keyword
  showHistory.value = false
  doSearch()
}

async function runSearch(nextOffset = 0) {
  if (!activeSearch.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const { type, query } = activeSearch.value
    const params = { limit: PAGE_SIZE, offset: nextOffset }
    if (type === 'port') params.port = query
    else params.q = query
    const response = await http.get(`/api/search/${type}`, { params })
    searchResult.value = response.data
    offset.value = nextOffset
  } catch (error) {
    searchResult.value = null
    errorMessage.value = error.response?.data?.message || '搜索失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

function doSearch() {
  const detected = detectSearchType(searchInput.value)
  if (detected.error) {
    searchResult.value = null
    errorMessage.value = detected.error
    return
  }
  activeSearch.value = detected
  pushHistory(searchInput.value.trim(), detected.type)
  showHistory.value = false
  runSearch(0)
}

function previousPage() {
  runSearch(Math.max(0, offset.value - PAGE_SIZE))
}

function nextPage() {
  if (searchResult.value && offset.value + PAGE_SIZE < searchResult.value.total) runSearch(offset.value + PAGE_SIZE)
}

function formatTime(timestamp) {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function formatNetworkOwner(item) {
  const asn = item.asn ? (/^AS/i.test(item.asn) ? item.asn : `AS${item.asn}`) : ''
  return [asn, item.as_org || item.isp].filter(Boolean).join(' · ') || '-'
}

function formatLocation(item) {
  const country = item.country_name
    ? `${item.country_name}${item.country_code ? ` (${item.country_code})` : ''}`
    : item.country_code || ''
  return [country, item.city_name].filter(Boolean).join(' · ') || '-'
}

function onDocumentClick(event) {
  if (searchBoxRef.value && !searchBoxRef.value.contains(event.target)) showHistory.value = false
}

onMounted(() => {
  loadHistory()
  document.addEventListener('mousedown', onDocumentClick)
})

onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))
</script>

<template>
  <nav class="absolute top-0 right-0 py-5 px-8 flex items-center gap-5">
    <a class="link" target="_blank" href="/">仪表盘</a>
    <a class="link" target="_blank" href="https://github.com/wshijiang/network-mapping/doc">文档</a>
  </nav>

  <main class="bg-base-200 min-h-screen px-4 py-24">
    <div class="mx-auto w-full max-w-5xl">
      <h1 class="mb-5 text-center text-3xl font-semibold md:text-4xl">Network-Mapping Search</h1>

      <div ref="searchBoxRef" class="relative mx-auto max-w-2xl">
        <div class="join w-full">
          <label class="input join-item w-full">
            <svg class="h-[1em] opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.5" /><path d="m20 20-3.5-3.5" fill="none" stroke="currentColor" stroke-width="2.5" /></svg>
            <input v-model="searchInput" type="text" class="grow" :placeholder="supportedSyntax" autofocus @focus="showHistory = true" @keyup.enter="doSearch" />
          </label>
          <button class="btn btn-neutral join-item px-6" :disabled="loading" @click="doSearch">{{ loading ? '搜索中' : '搜索' }}</button>
        </div>
        <div class="mt-2 flex items-center justify-between gap-3 text-xs opacity-60">
          <span>{{ supportedSyntax }}</span>
          <button type="button" class="link link-hover shrink-0" @click="openSyntaxDialog">搜索语法说明</button>
        </div>

        <div v-if="showHistory" class="absolute z-20 mt-2 w-full rounded-xl border border-base-300 bg-base-100 shadow-lg">
          <div class="flex items-center justify-between border-b border-base-300 px-4 py-3"><span class="text-sm font-medium">搜索历史</span><button class="btn btn-ghost btn-xs" @click="clearHistory">清空</button></div>
          <div v-if="searchHistory.length === 0" class="px-4 py-6 text-center text-sm opacity-60">暂无搜索历史</div>
          <ul v-else class="max-h-64 overflow-y-auto p-2"><li v-for="item in searchHistory" :key="item.keyword"><button class="btn btn-ghost w-full justify-start rounded-lg" @click="pickHistory(item)">{{ item.keyword }}</button></li></ul>
        </div>
      </div>

      <div v-if="errorMessage" role="alert" class="alert alert-error mx-auto mt-6 max-w-2xl"><span>{{ errorMessage }}</span></div>

      <section v-if="searchResult" class="mt-10 rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">{{ currentTypeLabel }}搜索结果</h2>
          <span class="text-sm opacity-70">“{{ searchResult.query }}” · 共 {{ searchResult.total }} 条</span>
        </div>
        <div v-if="searchResult.items.length === 0" class="py-12 text-center opacity-60">没有匹配的资产。</div>
        <div v-else class="overflow-x-auto">
          <table class="table table-zebra table-sm">
            <thead><tr><th>IP</th><th>端口</th><th>协议</th><th>服务</th><th>Banner</th><th>ASN / AS 组织</th><th>位置</th><th>扫描时间</th></tr></thead>
            <tbody><tr v-for="(item, index) in searchResult.items" :key="`${item.ip_address}-${item.port}-${item.scan_time}-${index}`"><td class="font-mono">{{ item.ip_address }}</td><td>{{ item.port ?? '-' }}</td><td>{{ item.protocol ?? '-' }}</td><td>{{ item.service ?? '-' }}</td><td class="max-w-xs truncate" :title="item.banner">{{ item.banner ?? '-' }}</td><td>{{ formatNetworkOwner(item) }}</td><td>{{ formatLocation(item) }}</td><td class="whitespace-nowrap">{{ formatTime(item.scan_time) }}</td></tr></tbody>
          </table>
        </div>
        <div v-if="searchResult.total > PAGE_SIZE" class="mt-5 flex justify-end gap-2"><button class="btn btn-sm" :disabled="loading || offset === 0" @click="previousPage">上一页</button><button class="btn btn-sm" :disabled="loading || offset + PAGE_SIZE >= searchResult.total" @click="nextPage">下一页</button></div>
      </section>
    </div>
  </main>

  <dialog ref="syntaxDialogRef" class="modal">
    <div class="modal-box w-[calc(100vw-2rem)] max-w-lg">
      <h3 class="text-lg font-bold">搜索语法说明</h3>
      <p class="py-3 text-sm opacity-70">输入 IP 或 CIDR 会自动识别；其余类型请使用前缀指定搜索范围。</p>

      <div class="space-y-3 text-sm">
        <div class="rounded-lg bg-base-200 p-3">
          <p class="font-medium">IP 地址</p>
          <code class="mt-1 inline-block rounded bg-base-300 px-2 py-1">221.233.151.58</code>
        </div>
        <div class="rounded-lg bg-base-200 p-3">
          <p class="font-medium">CIDR 网段</p>
          <code class="mt-1 inline-block rounded bg-base-300 px-2 py-1">221.233.151.0/24</code>
        </div>
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-lg bg-base-200 p-3"><p class="font-medium">端口</p><code class="mt-1 inline-block rounded bg-base-300 px-2 py-1">port:443</code></div>
          <div class="rounded-lg bg-base-200 p-3"><p class="font-medium">服务</p><code class="mt-1 inline-block rounded bg-base-300 px-2 py-1">service:https</code></div>
          <div class="rounded-lg bg-base-200 p-3"><p class="font-medium">Banner</p><code class="mt-1 inline-block rounded bg-base-300 px-2 py-1">banner:nginx</code></div>
        </div>
      </div>

      <div class="modal-action">
        <button type="button" class="btn btn-neutral" @click="closeSyntaxDialog">知道了</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button type="button" @click="closeSyntaxDialog">关闭</button>
    </form>
  </dialog>
</template>
