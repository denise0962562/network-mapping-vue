<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { feature as topojsonFeature } from 'topojson-client'
import worldCountries from 'world-atlas/countries-110m.json'
import AssetTags from '../components/AssetTags.vue'
import http from '../utils/http'
import { formatLocation } from '../utils/location'

const HISTORY_PAGE_SIZE = 50
const PORT_PAGE_SIZE = 20
const MAP_COUNTRY_NAMES = {
  US: 'United States of America',
  CD: 'Dem. Rep. Congo',
  CF: 'Central African Rep.',
  DO: 'Dominican Rep.',
  PS: 'Palestine',
  TL: 'Timor-Leste',
}
const worldCountriesGeometry = topojsonFeature(worldCountries, worldCountries.objects.countries)

const ipInput = ref('')
const loading = ref(false)
const errorMessage = ref('')
const summary = ref(null)
const ports = ref([])
const portsLoading = ref(false)
const portsTotal = ref(0)
const portsOffset = ref(0)
const selectedPort = ref(null)
const historyLoading = ref(false)
const historyError = ref('')
const historyItems = ref([])
const historyTotal = ref(0)
const historyOffset = ref(0)
const historyDialogRef = ref(null)
const tagDialogRef = ref(null)
const tagCatalog = ref([])
const tagCatalogLoading = ref(false)
const tagActionLoading = ref(false)
const tagError = ref('')
const selectedTagId = ref('')
const mapContainerRef = ref(null)
const mapError = ref('')
let assetMap = null

const assetIp = ref(new URLSearchParams(window.location.search).get('ip')?.trim() || '')
const portsPage = computed(() => Math.floor(portsOffset.value / PORT_PAGE_SIZE) + 1)
const portsPages = computed(() => Math.max(1, Math.ceil(portsTotal.value / PORT_PAGE_SIZE)))
const historyPage = computed(() => Math.floor(historyOffset.value / HISTORY_PAGE_SIZE) + 1)
const historyPages = computed(() => Math.max(1, Math.ceil(historyTotal.value / HISTORY_PAGE_SIZE)))
const assignedTags = computed(() => summary.value?.tags || [])
const assignedTagIds = computed(() => new Set(assignedTags.value.map((tag) => tag.id)))
const availableTags = computed(() => tagCatalog.value.filter((tag) => !assignedTagIds.value.has(tag.id)))
const networkOwner = computed(() => {
  if (!summary.value) return '-'
  const asn = summary.value.asn
    ? (/^AS/i.test(summary.value.asn) ? summary.value.asn : `AS${summary.value.asn}`)
    : ''
  return [asn, summary.value.as_org || summary.value.isp].filter(Boolean).join(' · ') || '-'
})
const location = computed(() => {
  if (!summary.value) return '-'
  return formatLocation(summary.value)
})
const mapPoint = computed(() => {
  if (!summary.value) return null
  const latitude = validCoordinate(summary.value.latitude, 90)
  const longitude = validCoordinate(summary.value.longitude, 180)
  if (latitude !== null && longitude !== null) {
    return {
      lat: latitude,
      lon: longitude,
      name: summary.value.ip,
      value: 1,
      location: location.value,
      precision: summary.value.city_name ? '城市级定位' : '坐标定位',
    }
  }

  const countryCode = String(summary.value.country_code || '').trim().toUpperCase()
  const country = MAP_COUNTRY_NAMES[countryCode] || String(summary.value.country_name || '').trim()
  if (!country) return null
  return {
    country,
    name: summary.value.ip,
    value: 1,
    location: location.value,
    precision: '国家级定位',
  }
})

function formatTime(timestamp) {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function validCoordinate(value, maximum) {
  if (value === null || value === undefined || value === '') return null
  const coordinate = Number(value)
  return Number.isFinite(coordinate) && Math.abs(coordinate) <= maximum ? coordinate : null
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character])
}

function destroyLocationMap() {
  if (assetMap?._mapPane?.parentNode) assetMap.remove()
  else mapContainerRef.value?.replaceChildren()
  assetMap = null
}

function countryCenter(countryName) {
  const country = worldCountriesGeometry.features.find((feature) => feature.properties?.name === countryName)
  if (!country) return null
  const bounds = L.geoJSON(country).getBounds()
  return bounds.isValid() ? bounds.getCenter() : null
}

function pointCoordinates(point) {
  if (Number.isFinite(point.lat) && Number.isFinite(point.lon)) return [point.lat, point.lon]
  const center = countryCenter(point.country)
  return center ? [center.lat, center.lng] : null
}

async function renderLocationMap() {
  destroyLocationMap()
  mapError.value = ''
  await nextTick()
  const point = mapPoint.value
  if (!point || !mapContainerRef.value) return
  const coordinates = pointCoordinates(point)
  if (!coordinates) {
    mapError.value = '地图暂时无法加载：未找到该国家的边界数据。'
    return
  }

  let map = null
  try {
    map = L.map(mapContainerRef.value, {
      crs: L.CRS.EPSG4326,
      center: [0, 0],
      zoom: 1,
      zoomControl: true,
      attributionControl: false,
      worldCopyJump: true,
      minZoom: 0,
      maxZoom: 8,
      zoomSnap: 0,
    })
    let correctingLatitude = false
    map.on('moveend', () => {
      if (correctingLatitude) return
      const center = map.getCenter()
      const latitude = Math.max(-135, Math.min(135, center.lat))
      if (latitude === center.lat) return
      correctingLatitude = true
      map.panTo([latitude, center.lng], { animate: false })
      correctingLatitude = false
    })
    L.geoJSON(worldCountriesGeometry, {
      style: {
        color: '#cbd5e1',
        weight: 1,
        fillColor: '#e8ecf2',
        fillOpacity: 1,
      },
    }).addTo(map)
    L.circleMarker(coordinates, {
      radius: 9,
      color: '#ffffff',
      weight: 2,
      fillColor: '#2563eb',
      fillOpacity: 0.9,
    }).bindTooltip(
      `<div style="font-weight:600">${escapeHtml(point.name)}</div><div style="margin-top:2px">${escapeHtml(point.location)}</div><div style="margin-top:2px;opacity:.65;font-size:12px">${escapeHtml(point.precision)}</div>`,
      { direction: 'top', offset: [0, -8], sticky: true },
    ).addTo(map)
    map.invalidateSize()
    assetMap = map
  } catch (error) {
    console.error('资产地理位置地图加载失败', error)
    if (map?._loaded) map.remove()
    else {
      mapContainerRef.value?.replaceChildren()
      mapContainerRef.value?.classList.remove('leaflet-container', 'leaflet-touch', 'leaflet-fade-anim')
      mapContainerRef.value?.removeAttribute('tabindex')
      mapContainerRef.value?.style.removeProperty('position')
    }
    assetMap = null
    const message = error instanceof Error && error.message ? `：${error.message}` : '。'
    mapError.value = `地图暂时无法加载${message}`
  }
}

function submitIp() {
  const ip = ipInput.value.trim()
  if (!ip) return
  window.location.assign(`/asset.html?ip=${encodeURIComponent(ip)}`)
}

async function loadAsset() {
  destroyLocationMap()
  summary.value = null
  ports.value = []
  portsTotal.value = 0
  portsOffset.value = 0
  errorMessage.value = ''
  if (!assetIp.value) {
    errorMessage.value = '请输入需要查看的资产 IP。'
    return
  }
  loading.value = true
  try {
    const [summaryResponse, portsResponse] = await Promise.all([
      http.get('/api/assets/summary', { params: { ip: assetIp.value } }),
      http.get('/api/assets/ports', {
        params: { ip: assetIp.value, limit: PORT_PAGE_SIZE, offset: 0 },
      }),
    ])
    summary.value = summaryResponse.data?.data?.summary || null
    if (summary.value) summary.value.tags = Array.isArray(summary.value.tags) ? summary.value.tags : []
    const portsData = portsResponse.data?.data || {}
    ports.value = portsData.items || []
    portsTotal.value = Number(portsData.total) || 0
  } catch (error) {
    errorMessage.value = error.response?.data?.message || '资产聚合数据加载失败。'
  } finally {
    loading.value = false
    if (summary.value) await renderLocationMap()
  }
}

async function loadPorts(offset) {
  portsLoading.value = true
  errorMessage.value = ''
  try {
    const response = await http.get('/api/assets/ports', {
      params: { ip: assetIp.value, limit: PORT_PAGE_SIZE, offset },
    })
    const data = response.data?.data || {}
    ports.value = data.items || []
    portsTotal.value = Number(data.total) || 0
    portsOffset.value = offset
  } catch (error) {
    errorMessage.value = error.response?.data?.message || '端口数据加载失败。'
  } finally {
    portsLoading.value = false
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

async function loadTagCatalog() {
  tagCatalogLoading.value = true
  tagError.value = ''
  try {
    const response = await http.get('/api/tags')
    tagCatalog.value = response.data?.data?.items || []
  } catch (error) {
    tagError.value = error.response?.data?.message || '标签列表加载失败。'
  } finally {
    tagCatalogLoading.value = false
  }
}

function openTagDialog() {
  selectedTagId.value = ''
  tagError.value = ''
  tagDialogRef.value?.showModal()
  loadTagCatalog()
}

function closeTagDialog() {
  tagDialogRef.value?.close()
}

async function assignTag(tagId = selectedTagId.value) {
  if (!tagId) return
  tagActionLoading.value = true
  tagError.value = ''
  try {
    const response = await http.post('/api/assets/tags', { ip: assetIp.value, tag_id: Number(tagId) })
    const tag = response.data?.data?.tag
    if (tag && !assignedTagIds.value.has(tag.id)) summary.value.tags.push(tag)
    selectedTagId.value = ''
  } catch (error) {
    tagError.value = error.response?.data?.message || '标签绑定失败。'
  } finally {
    tagActionLoading.value = false
  }
}

async function removeTag(tag) {
  tagActionLoading.value = true
  tagError.value = ''
  try {
    await http.delete(`/api/assets/tags/${tag.id}`, { params: { ip: assetIp.value } })
    summary.value.tags = assignedTags.value.filter((item) => item.id !== tag.id)
  } catch (error) {
    tagError.value = error.response?.data?.message || '标签移除失败。'
  } finally {
    tagActionLoading.value = false
  }
}

onMounted(() => {
  ipInput.value = assetIp.value
  loadAsset()
})

onBeforeUnmount(destroyLocationMap)
</script>

<template>
  <main class="min-h-screen bg-base-200 p-4 md:p-6">
    <div class="mx-auto max-w-7xl space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold">资产详情</h1>
          <p class="mt-1 text-sm opacity-65">展示单个 IP 的网络属性、发现概况和端口服务。</p>
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
          <button class="btn btn-neutral" :disabled="loading">{{ loading ? '加载中' : '搜索' }}</button>
        </form>
      </section>

      <div v-if="errorMessage" role="alert" class="alert alert-error"><span>{{ errorMessage }}</span></div>

      <div v-if="loading" class="flex justify-center py-20"><span class="loading loading-spinner loading-lg"></span></div>

      <template v-else-if="summary">
        <section class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide opacity-55">IP 地址</p>
              <div class="mt-1 flex flex-wrap items-center gap-2">
                <h2 class="break-all font-mono text-2xl font-semibold">{{ summary.ip }}</h2>
                <AssetTags :tags="assignedTags" />
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button v-if="summary.can_manage_tags" type="button" class="btn btn-outline btn-sm" @click="openTagDialog">管理标签</button>
              <span class="badge badge-info badge-lg">{{ summary.port_count }} 个端口</span>
            </div>
          </div>

          <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-lg bg-base-200 p-4"><p class="text-xs opacity-60">端口总数</p><p class="mt-1 text-2xl font-semibold">{{ summary.port_count }}</p></div>
            <div class="rounded-lg bg-base-200 p-4"><p class="text-xs opacity-60">识别服务</p><p class="mt-1 text-2xl font-semibold">{{ summary.service_count }}</p></div>
            <div class="rounded-lg bg-base-200 p-4"><p class="text-xs opacity-60">数据来源</p><p class="mt-1 text-2xl font-semibold">{{ summary.scanner_count }}</p></div>
            <div class="rounded-lg bg-base-200 p-4"><p class="text-xs opacity-60">观察记录</p><p class="mt-1 text-2xl font-semibold">{{ summary.observation_count }}</p></div>
          </div>
        </section>

        <section class="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-sm">
          <div class="grid lg:grid-cols-[minmax(0,1.7fr)_minmax(19rem,1fr)]">
            <div class="p-5">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="font-semibold">IP 地理位置</h2>
                  <p class="mt-1 text-sm opacity-60">{{ mapPoint?.precision || '未提供可用的地理位置' }}</p>
                </div>
                <span v-if="mapPoint" class="badge badge-outline">{{ location }}</span>
              </div>
              <div v-if="mapPoint && !mapError" ref="mapContainerRef" class="mt-4 h-[360px] cursor-grab touch-none overflow-hidden rounded-lg border border-base-300 bg-base-200/40"></div>
              <div v-else-if="mapError" class="mt-4 flex h-[180px] items-center justify-center rounded-lg bg-base-200/60 text-sm opacity-60">{{ mapError }}</div>
              <div v-else class="mt-4 flex h-[180px] items-center justify-center rounded-lg bg-base-200/60 text-sm opacity-60">
                暂无该 IP 的地理位置数据。
              </div>
            </div>
            <div class="border-t border-base-300 p-5 lg:border-l lg:border-t-0">
              <h2 class="font-semibold">网络与位置</h2>
              <dl class="mt-4 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-3 text-sm">
                <dt class="opacity-60">ASN / AS 组织</dt><dd class="break-words">{{ networkOwner }}</dd>
                <dt class="opacity-60">ISP</dt><dd class="break-words">{{ summary.isp || '-' }}</dd>
                <dt class="opacity-60">地理位置</dt><dd>{{ location }}</dd>
              </dl>
            </div>
          </div>
        </section>

        <section class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <h2 class="font-semibold">发现时间</h2>
          <dl class="mt-4 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-3 text-sm">
            <dt class="opacity-60">首次发现</dt><dd>{{ formatTime(summary.first_seen_at) }}</dd>
            <dt class="opacity-60">最近发现</dt><dd>{{ formatTime(summary.last_seen_at) }}</dd>
          </dl>
        </section>

        <div role="alert" class="alert alert-info alert-dash text-sm">
          <span>扫描器当前仅上报开放端口，端口详情展示每个端口最近一次扫描结果。</span>
        </div>

        <section class="rounded-xl border border-base-300 bg-base-100 shadow-sm">
          <div class="flex items-center justify-between border-b border-base-300 px-4 py-3">
            <h2 class="font-semibold"><span class="font-mono">{{ assetIp || '-' }}</span> 的端口</h2>
            <span class="text-sm opacity-60">共 {{ portsTotal }} 个</span>
          </div>
          <div v-if="portsLoading" class="flex justify-center py-16"><span class="loading loading-spinner loading-lg"></span></div>
          <div v-else-if="ports.length === 0" class="py-16 text-center opacity-60">暂无端口观察记录。</div>
          <div v-else class="overflow-x-auto">
            <table class="table table-zebra">
              <thead>
                <tr><th>端口</th><th>协议 / 服务</th><th>Banner</th><th>首次发现</th><th>最近发现</th><th>来源</th><th></th></tr>
              </thead>
              <tbody>
                <tr v-for="port in ports" :key="port.port">
                  <td class="font-mono font-semibold">{{ port.port }}</td>
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
          <div v-if="portsTotal > PORT_PAGE_SIZE" class="flex items-center justify-end gap-3 border-t border-base-300 px-4 py-3">
            <span class="text-sm opacity-60">第 {{ portsPage }} / {{ portsPages }} 页</span>
            <button class="btn btn-sm" :disabled="portsLoading || portsOffset === 0" @click="loadPorts(Math.max(0, portsOffset - PORT_PAGE_SIZE))">上一页</button>
            <button class="btn btn-sm" :disabled="portsLoading || portsOffset + PORT_PAGE_SIZE >= portsTotal" @click="loadPorts(portsOffset + PORT_PAGE_SIZE)">下一页</button>
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

  <dialog ref="tagDialogRef" class="modal">
    <div class="modal-box w-[calc(100vw-2rem)] max-w-3xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-bold">绑定资产标签</h3>
          <p class="mt-1 font-mono text-sm opacity-65">{{ assetIp }}</p>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" @click="closeTagDialog">关闭</button>
      </div>

      <div v-if="tagError" role="alert" class="alert alert-error mt-4 text-sm"><span>{{ tagError }}</span></div>
      <div v-if="tagCatalogLoading" class="flex justify-center py-12"><span class="loading loading-spinner loading-md"></span></div>

      <div v-else class="mt-5 space-y-5">
        <section>
          <h4 class="text-sm font-semibold">已绑定标签</h4>
          <div v-if="assignedTags.length" class="mt-2 flex flex-wrap gap-2">
            <button
              v-for="tag in assignedTags"
              :key="tag.id"
              type="button"
              class="btn btn-sm"
              :class="tag.kind === 'malicious' ? 'btn-error' : tag.kind === 'benign' ? 'btn-success' : 'btn-info'"
              :disabled="tagActionLoading"
              :title="`${tag.category_name || '未分类'} · ${tag.description || tag.name}（点击移除）`"
              @click="removeTag(tag)"
            >
              {{ tag.name }} ×
            </button>
          </div>
          <p v-else class="mt-2 text-sm opacity-60">该 IP 暂无标签。</p>
        </section>

        <section class="rounded-lg bg-base-200/60 p-4">
          <h4 class="text-sm font-semibold">添加已有标签</h4>
          <div class="mt-3 flex flex-col gap-2 sm:flex-row">
            <select v-model="selectedTagId" class="select select-bordered w-full" :disabled="tagActionLoading || availableTags.length === 0">
              <option value="">{{ availableTags.length ? '选择标签' : '没有可添加的标签' }}</option>
              <option v-for="tag in availableTags" :key="tag.id" :value="tag.id">{{ tag.category_name || '未分类' }} · {{ tag.name }}</option>
            </select>
            <button type="button" class="btn btn-neutral" :disabled="tagActionLoading || !selectedTagId" @click="assignTag()">添加</button>
          </div>
        </section>

        <div class="flex items-center justify-between gap-3 rounded-lg border border-base-300 p-4 text-sm">
          <span class="opacity-65">标签分类、名称和风险属性由标签中心统一维护。</span>
          <a class="btn btn-ghost btn-sm" href="/admin/tags">打开标签管理</a>
        </div>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>关闭</button></form>
  </dialog>
</template>
