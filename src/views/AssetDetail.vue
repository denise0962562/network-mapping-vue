<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http from '../utils/http'

const HISTORY_PAGE_SIZE = 50

const route = useRoute()
const router = useRouter()
const ipInput = ref('')
const loading = ref(false)
const errorMessage = ref('')
const ports = ref([])
const staleAfterDays = ref(30)
const selectedPort = ref(null)
const historyLoading = ref(false)
const historyError = ref('')
const historyItems = ref([])
const historyTotal = ref(0)
const historyOffset = ref(0)
const historyDialogRef = ref(null)

const assetIp = computed(() => typeof route.query.ip === 'string' ? route.query.ip.trim() : '')
const historyPage = computed(() => Math.floor(historyOffset.value / HISTORY_PAGE_SIZE) + 1)
const historyPages = computed(() => Math.max(1, Math.ceil(historyTotal.value / HISTORY_PAGE_SIZE)))

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
  router.push({ path: '/asset', query: { ip } })
}

async function loadPorts() {
  ports.value = []
  errorMessage.value = ''
  if (!assetIp.value) {
    errorMessage.value = '请输入需要查看的资产 IP。'
    return
  }
  loading.value = true
  try {
    const response = await http.get('/api/assets/ports', {
      params: { ip: assetIp.value, stale_after_days: staleAfterDays.value },
    })
    ports.value = response.data?.data?.items || []
  } catch (error) {
    errorMessage.value = error.response?.data?.message || '资产端口状态加载失败。'
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

watch(assetIp, (value) => {
  ipInput.value = value
  loadPorts()
})

onMounted(() => {
  ipInput.value = assetIp.value
  loadPorts()
})
</script>

<template>
  <main class="p-4 md:p-6">
    <div class="mx-auto max-w-7xl space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold">资产端口状态</h1>
          <p class="mt-1 text-sm opacity-65">查看开放端口、当前服务以及历次扫描观察。</p>
        </div>
        <router-link to="/" class="btn btn-ghost btn-sm">返回仪表盘</router-link>
      </div>

      <section class="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
        <form class="flex flex-col gap-3 sm:flex-row" @submit.prevent="submitIp">
          <label class="input w-full">
            <span class="label">IP</span>
            <input v-model="ipInput" class="font-mono" placeholder="192.0.2.1 或 2001:db8::1" />
          </label>
          <label class="form-control sm:w-56">
            <span class="label-text mb-1">过期阈值</span>
            <select v-model.number="staleAfterDays" class="select select-bordered w-full" @change="loadPorts">
              <option :value="7">7 天</option>
              <option :value="30">30 天</option>
              <option :value="90">90 天</option>
              <option :value="180">180 天</option>
            </select>
          </label>
          <button class="btn btn-neutral sm:self-end" :disabled="loading">{{ loading ? '加载中' : '查看资产' }}</button>
        </form>
      </section>

      <div role="alert" class="alert alert-info text-sm">
        <span>扫描器当前只上报开放端口。“可能过期”表示长期没有再次观察到，并不等同于端口已经关闭。</span>
      </div>

      <div v-if="errorMessage" role="alert" class="alert alert-error"><span>{{ errorMessage }}</span></div>

      <section class="rounded-xl border border-base-300 bg-base-100 shadow-sm">
        <div class="flex items-center justify-between border-b border-base-300 px-4 py-3">
          <h2 class="font-semibold"><span class="font-mono">{{ assetIp || '-' }}</span> 的端口</h2>
          <span class="text-sm opacity-60">{{ ports.length }} 个</span>
        </div>
        <div v-if="loading" class="flex justify-center py-16"><span class="loading loading-spinner loading-lg"></span></div>
        <div v-else-if="ports.length === 0 && !errorMessage" class="py-16 text-center opacity-60">暂无端口观察记录。</div>
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
              <td><router-link class="link link-primary font-mono text-xs" :to="`/task/${item.task_id}`">{{ item.task_id.slice(0, 8) }}</router-link></td>
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
