<script setup>
import { computed, onMounted, ref } from 'vue'
import http from '../utils/http'

const HISTORY_PAGE_SIZE = 50

const ipInput = ref('')
const loading = ref(false)
const errorMessage = ref('')
const summary = ref(null)
const ports = ref([])
const staleAfterDays = ref(30)
const selectedPort = ref(null)
const historyLoading = ref(false)
const historyError = ref('')
const historyItems = ref([])
const historyTotal = ref(0)
const historyOffset = ref(0)
const historyDialogRef = ref(null)

const assetIp = ref(new URLSearchParams(window.location.search).get('ip')?.trim() || '')
const historyPage = computed(() => Math.floor(historyOffset.value / HISTORY_PAGE_SIZE) + 1)
const historyPages = computed(() => Math.max(1, Math.ceil(historyTotal.value / HISTORY_PAGE_SIZE)))
const networkOwner = computed(() => {
  if (!summary.value) return '-'
  const asn = summary.value.asn
    ? (/^AS/i.test(summary.value.asn) ? summary.value.asn : `AS${summary.value.asn}`)
    : ''
  return [asn, summary.value.as_org || summary.value.isp].filter(Boolean).join(' · ') || '-'
})
const location = computed(() => {
  if (!summary.value) return '-'
  const country = summary.value.country_name
    ? `${summary.value.country_name}${summary.value.country_code ? ` (${summary.value.country_code})` : ''}`
    : summary.value.country_code || ''
  return [country, summary.value.city_name].filter(Boolean).join(' · ') || '-'
})

function formatTime(timestamp) {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function stateLabel(state) {
  return state === 'stale' ? '可能过期' : '开放'
}

function stateBadgeClass(state) {
  return state === 'stale' ? 'badge-warning' : 'badge-success'
}

function submitIp() {
  const ip = ipInput.value.trim()
  if (!ip) return
  window.location.assign(`/asset.html?ip=${encodeURIComponent(ip)}`)
}

async function loadAsset() {
  summary.value = null
  ports.value = []
  errorMessage.value = ''
  if (!assetIp.value) {
    errorMessage.value = '请输入需要查看的资产 IP。'
    return
  }
  loading.value = true
  try {
    const params = { ip: assetIp.value, stale_after_days: staleAfterDays.value }
    const [summaryResponse, portsResponse] = await Promise.all([
      http.get('/api/assets/summary', { params }),
      http.get('/api/assets/ports', { params }),
    ])
    summary.value = summaryResponse.data?.data?.summary || null
    ports.value = portsResponse.data?.data?.items || []
  } catch (error) {
    errorMessage.value = error.response?.data?.message || '资产聚合数据加载失败。'
  } finally {
    loading.value = false
  }
}

async function loadHistory(offset = 0) {
  if (!selectedPort.value) return
  historyLoading.value = true
  historyError.value = ''
  try {
    const response = await http.get('/api/assets/port-history', {
      params: {
        ip: assetIp.value,
        port: selectedPort.value.port,
        limit: HISTORY_PAGE_SIZE,
        offset,
      },
    })
    const data = response.data?.data || {}
    historyItems.value = data.items || []
    historyTotal.value = Number(data.total) || 0
    historyOffset.value = offset
  } catch (error) {
    historyItems.value = []
    historyTotal.value = 0
    historyError.value = error.response?.data?.message || '端口历史加载失败。'
  } finally {
    historyLoading.value = false
  }
}

function openHistory(port) {
  selectedPort.value = port
  historyItems.value = []
  historyOffset.value = 0
  historyDialogRef.value?.showModal()
  loadHistory(0)
}

function closeHistory() {
  historyDialogRef.value?.close()
}

onMounted(() => {
  ipInput.value = assetIp.value
  loadAsset()
})
</script>

<template>
  <main class="min-h-screen bg-base-200 p-4 md:p-6">
    <div class="mx-auto max-w-7xl space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold">资产聚合详情</h1>
          <p class="mt-1 text-sm opacity-65">聚合展示单个 IP 的网络属性、发现概况和端口服务。</p>
        </div>
        <div class="flex gap-2">
          <a href="/search.html" class="btn btn-ghost btn-sm">返回搜索</a>
          <a href="/" class="btn btn-ghost btn-sm">仪表盘</a>
        </div>
      </div>

      <section class="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
        <form class="flex flex-col gap-3 sm:flex-row" @submit.prevent="submitIp">
          <label class="input w-full">
            <span class="label">IP</span>
            <input v-model="ipInput" class="font-mono" placeholder="192.0.2.1 或 2001:db8::1" />
          </label>
          <label class="form-control sm:w-56">
            <span class="label-text mb-1">过期阈值</span>
            <select v-model.number="staleAfterDays" class="select select-bordered w-full" @change="loadAsset">
              <option :value="7">7 天</option>
              <option :value="30">30 天</option>
              <option :value="90">90 天</option>
              <option :value="180">180 天</option>
            </select>
          </label>
          <button class="btn btn-neutral sm:self-end" :disabled="loading">{{ loading ? '加载中' : '聚合查看' }}</button>
        </form>
      </section>

      <div v-if="errorMessage" role="alert" class="alert alert-error"><span>{{ errorMessage }}</span></div>

      <div v-if="loading" class="flex justify-center py-20"><span class="loading loading-spinner loading-lg"></span></div>

      <template v-else-if="summary">
        <section class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide opacity-55">IP 地址</p>
              <h2 class="mt-1 break-all font-mono text-2xl font-semibold">{{ summary.ip }}</h2>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class="badge badge-success badge-lg">{{ summary.active_port_count }} 个活跃端口</span>
              <span v-if="summary.stale_port_count" class="badge badge-warning badge-lg">{{ summary.stale_port_count }} 个可能过期</span>
            </div>
          </div>

          <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-lg bg-base-200 p-4"><p class="text-xs opacity-60">端口总数</p><p class="mt-1 text-2xl font-semibold">{{ summary.port_count }}</p></div>
            <div class="rounded-lg bg-base-200 p-4"><p class="text-xs opacity-60">识别服务</p><p class="mt-1 text-2xl font-semibold">{{ summary.service_count }}</p></div>
            <div class="rounded-lg bg-base-200 p-4"><p class="text-xs opacity-60">数据来源</p><p class="mt-1 text-2xl font-semibold">{{ summary.scanner_count }}</p></div>
            <div class="rounded-lg bg-base-200 p-4"><p class="text-xs opacity-60">观察记录</p><p class="mt-1 text-2xl font-semibold">{{ summary.observation_count }}</p></div>
          </div>
        </section>

        <section class="grid gap-4 lg:grid-cols-2">
          <div class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm">
            <h2 class="font-semibold">网络与位置</h2>
            <dl class="mt-4 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-3 text-sm">
              <dt class="opacity-60">ASN / AS 组织</dt><dd class="break-words">{{ networkOwner }}</dd>
              <dt class="opacity-60">ISP</dt><dd class="break-words">{{ summary.isp || '-' }}</dd>
              <dt class="opacity-60">地理位置</dt><dd>{{ location }}</dd>
            </dl>
          </div>
          <div class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm">
            <h2 class="font-semibold">发现时间</h2>
            <dl class="mt-4 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-3 text-sm">
              <dt class="opacity-60">首次发现</dt><dd>{{ formatTime(summary.first_seen_at) }}</dd>
              <dt class="opacity-60">最近发现</dt><dd>{{ formatTime(summary.last_seen_at) }}</dd>
              <dt class="opacity-60">过期阈值</dt><dd>{{ staleAfterDays }} 天</dd>
            </dl>
          </div>
        </section>

        <div role="alert" class="alert alert-info text-sm">
          <span>扫描器当前只上报开放端口。“可能过期”表示长期没有再次观察到，并不等同于端口已经关闭。</span>
        </div>

        <section class="rounded-xl border border-base-300 bg-base-100 shadow-sm">
          <div class="flex items-center justify-between border-b border-base-300 px-4 py-3">
            <h2 class="font-semibold"><span class="font-mono">{{ assetIp || '-' }}</span> 的端口</h2>
            <span class="text-sm opacity-60">{{ ports.length }} 个</span>
          </div>
          <div v-if="ports.length === 0" class="py-16 text-center opacity-60">暂无端口观察记录。</div>
          <div v-else class="overflow-x-auto">
            <table class="table table-zebra">
              <thead>
                <tr><th>端口</th><th>状态</th><th>协议 / 服务</th><th>Banner</th><th>首次发现</th><th>最近发现</th><th>来源</th><th></th></tr>
              </thead>
              <tbody>
                <tr v-for="port in ports" :key="port.port">
                  <td class="font-mono font-semibold">{{ port.port }}</td>
                  <td><span class="badge" :class="stateBadgeClass(port.state)">{{ stateLabel(port.state) }}</span></td>
                  <td>
                    <div>{{ port.protocol || '-' }}<span v-if="port.service"> · {{ port.service }}</span></div>
                    <div v-if="port.service_stale" class="mt-1 text-xs text-warning">服务信息早于最近端口观察</div>
                  </td>
                  <td class="max-w-xs truncate" :title="port.banner">{{ port.banner || '-' }}</td>
                  <td class="whitespace-nowrap">{{ formatTime(port.first_seen_at) }}</td>
                  <td class="whitespace-nowrap">{{ formatTime(port.last_seen_at) }}</td>
                  <td>
                    <div>{{ port.source }}</div>
                    <div v-if="port.service_source" class="text-xs opacity-60">服务：{{ port.service_source }}</div>
                  </td>
                  <td><button class="btn btn-ghost btn-sm whitespace-nowrap" @click="openHistory(port)">历史</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>
  </main>

  <dialog ref="historyDialogRef" class="modal">
    <div class="modal-box w-[calc(100vw-2rem)] max-w-6xl">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="text-lg font-bold">端口观察历史</h3>
          <p class="font-mono text-sm opacity-65">{{ assetIp }}:{{ selectedPort?.port }}</p>
        </div>
        <button class="btn btn-ghost btn-sm" @click="closeHistory">关闭</button>
      </div>

      <div v-if="historyError" role="alert" class="alert alert-error mt-4"><span>{{ historyError }}</span></div>
      <div v-if="historyLoading" class="flex justify-center py-16"><span class="loading loading-spinner loading-lg"></span></div>
      <div v-else-if="historyItems.length === 0 && !historyError" class="py-16 text-center opacity-60">暂无历史记录。</div>
      <div v-else class="mt-5 overflow-x-auto">
        <table class="table table-sm table-zebra">
          <thead><tr><th>时间</th><th>类型</th><th>状态</th><th>协议 / 服务</th><th>来源</th><th>扫描器</th><th>任务</th><th>数据</th></tr></thead>
          <tbody>
            <tr v-for="item in historyItems" :key="item.id">
              <td class="whitespace-nowrap">{{ formatTime(item.observed_at) }}</td>
              <td><span class="badge badge-outline">{{ item.kind === 'service' ? '服务' : '端口' }}</span></td>
              <td>{{ item.state }}</td>
              <td>{{ item.protocol || '-' }}<span v-if="item.service"> · {{ item.service }}</span></td>
              <td>{{ item.source }}</td>
              <td>{{ item.scanner_name || '-' }}</td>
              <td><a class="link font-mono text-xs" :href="`/task/${item.task_id}`">{{ item.task_id.slice(0, 8) }}</a></td>
              <td>
                <details v-if="item.banner || item.data" class="dropdown dropdown-end">
                  <summary class="btn btn-ghost btn-xs">查看</summary>
                  <div class="dropdown-content z-20 mt-1 max-h-72 w-96 overflow-auto rounded-box border border-base-300 bg-base-100 p-3 shadow">
                    <p v-if="item.banner" class="mb-2 whitespace-pre-wrap break-all text-xs">{{ item.banner }}</p>
                    <pre v-if="item.data" class="whitespace-pre-wrap break-all text-xs">{{ JSON.stringify(item.data, null, 2) }}</pre>
                  </div>
                </details>
                <span v-else>-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="historyTotal > HISTORY_PAGE_SIZE" class="mt-5 flex items-center justify-end gap-3">
        <span class="text-sm opacity-60">第 {{ historyPage }} / {{ historyPages }} 页</span>
        <button class="btn btn-sm" :disabled="historyLoading || historyOffset === 0" @click="loadHistory(Math.max(0, historyOffset - HISTORY_PAGE_SIZE))">上一页</button>
        <button class="btn btn-sm" :disabled="historyLoading || historyOffset + HISTORY_PAGE_SIZE >= historyTotal" @click="loadHistory(historyOffset + HISTORY_PAGE_SIZE)">下一页</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button @click="closeHistory">关闭</button></form>
  </dialog>
</template>
