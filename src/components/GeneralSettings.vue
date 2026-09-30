<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, useId, watch } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import http from '@/utils/http'
import { applyTimeSettings, offsetLabel } from '@/utils/systemTime'

const emit = defineEmits(['dirty'])
const document = ref({ timezone: 'Asia/Shanghai', hourCycle: '24', dateFormat: 'YYYY-MM-DD' })
const saved = ref(null)
const revision = ref(0)
const timezones = ref([])
const search = ref('')
const timezoneDropdown = ref(null)
const timezoneTrigger = ref(null)
const timezoneSearch = ref(null)
const timezoneOpen = ref(false)
const activeOption = ref(-1)
const timezoneListId = `timezone-list-${useId()}`
const loading = ref(true)
const failed = ref(false)
const saving = ref(false)
const alert = ref(null)
const now = ref(Date.now())
let clockTimer
const dirty = computed(() => saved.value !== null && JSON.stringify(document.value) !== JSON.stringify(saved.value))
watch(dirty, (value) => emit('dirty', value))
const labels = { 'Asia/Shanghai': '中国大陆', 'Asia/Hong_Kong': '中国香港', 'Asia/Macau': '中国澳门', 'Asia/Taipei': '中国台湾', UTC: '协调世界时', 'Asia/Tokyo': '日本', 'Asia/Singapore': '新加坡', 'America/New_York': '美国纽约', 'Europe/London': '英国伦敦' }
function label(zone) {
  return `${labels[zone.id] ? `${labels[zone.id]} · ` : ''}${zone.id} · ${offsetLabel(zone.offsetSeconds * 1000)} · ${zone.observesDst ? '本年有夏令时调整' : '本年无夏令时调整'}`
}
const options = computed(() => timezones.value.filter((zone) => label(zone).toLowerCase().includes(search.value.trim().toLowerCase())))
const selected = computed(() => timezones.value.find((zone) => zone.id === document.value.timezone))
function resetActiveOption() {
  const selectedIndex = options.value.findIndex((zone) => zone.id === document.value.timezone)
  activeOption.value = selectedIndex >= 0 ? selectedIndex : options.value.length ? 0 : -1
}
function scrollActiveOption() {
  nextTick(() => timezoneDropdown.value?.querySelector(`[data-option-index="${activeOption.value}"]`)?.scrollIntoView({ block: 'nearest' }))
}
watch(search, () => { resetActiveOption(); scrollActiveOption() })
async function openTimezone() {
  if (saving.value) return
  search.value = ''
  resetActiveOption()
  timezoneOpen.value = true
  await nextTick()
  timezoneSearch.value?.focus()
  scrollActiveOption()
}
function closeTimezone(restoreFocus = false) {
  timezoneOpen.value = false
  if (restoreFocus) timezoneTrigger.value?.focus()
}
function selectTimezone(zone) {
  document.value.timezone = zone.id
  closeTimezone(true)
}
function timezoneKeydown(event) {
  if (event.isComposing) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeTimezone(true)
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!options.value.length) return
    const step = event.key === 'ArrowDown' ? 1 : -1
    activeOption.value = (activeOption.value + step + options.value.length) % options.value.length
    scrollActiveOption()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    if (options.value[activeOption.value]) selectTimezone(options.value[activeOption.value])
  }
}
function timezoneFocusout(event) {
  if (!timezoneDropdown.value?.contains(event.relatedTarget)) closeTimezone()
}
function timezonePointerdown(event) {
  if (!timezoneDropdown.value?.contains(event.target)) closeTimezone()
}
watch(saving, (value) => { if (value) closeTimezone() })
const preview = computed(() => {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: document.value.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now.value).map(({ type, value }) => [type, value]))
    const date = document.value.dateFormat === 'DD/MM/YYYY' ? `${parts.day}/${parts.month}/${parts.year}` : [parts.year, parts.month, parts.day].join(document.value.dateFormat === 'YYYY/MM/DD' ? '/' : '-')
    const time = new Intl.DateTimeFormat('zh-CN', { timeZone: document.value.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: document.value.hourCycle === '12' ? 'h12' : 'h23' }).format(now.value)
    return `${date} ${time}`
  } catch { return '请选择有效时区' }
})
function apply(data) {
  document.value = { ...data.document }
  saved.value = { ...data.document }
  revision.value = data.revision
}
async function load() {
  loading.value = true
  failed.value = false
  try {
    const [settings, zones] = await Promise.all([http.get('/api/config/runtime/general'), http.get('/api/system/timezones')])
    if (!settings.data?.success || !zones.data?.success) throw new Error('常规设置加载失败')
    apply(settings.data.data)
    timezones.value = zones.data.data.filter((zone) => {
      try { new Intl.DateTimeFormat('en', { timeZone: zone.id }); return true } catch { return false }
    })
  } catch (e) {
    failed.value = true
    alert.value = { type: 'error', title: '常规设置加载失败', description: e.response?.data?.message || '请稍后重试。' }
  } finally { loading.value = false }
}
async function save() {
  if (saving.value || loading.value || failed.value) return false
  if (!dirty.value) return true
  saving.value = true
  try {
    const response = await http.post('/api/config/runtime/general', { expectedRevision: revision.value, document: document.value, changeReason: '更新系统常规设置' })
    if (!response.data?.success) throw new Error('服务器未确认保存成功')
    apply(response.data.data)
    applyTimeSettings(response.data.data)
    alert.value = { type: 'success', title: '常规设置已保存', description: '页面时间、统计、邮件及未来报告计划将使用所选时区，历史报告保留原时区。' }
    return true
  } catch (e) {
    alert.value = { type: 'error', title: '常规设置保存失败', description: e.response?.data?.message || e.message }
    return false
  } finally { saving.value = false }
}
defineExpose({ save })
onMounted(() => {
  load()
  clockTimer = window.setInterval(() => { now.value = Date.now() }, 1000)
  window.addEventListener('pointerdown', timezonePointerdown)
})
onBeforeUnmount(() => {
  window.clearInterval(clockTimer)
  window.removeEventListener('pointerdown', timezonePointerdown)
})
</script>

<template>
  <div class="card bg-base-100 card-border border-base-300 p-4">
    <div class="mb-3 flex items-start justify-between gap-3">
      <div><h3 class="font-semibold">常规设置</h3><p class="mt-1 text-xs opacity-60">统一系统时间显示、统计周期、邮件时间和报告计划。</p></div>
      <button class="btn btn-neutral btn-sm rounded-lg" :class="dirty ? 'visible' : 'invisible'" :disabled="!dirty || loading || saving || failed" @click="save"><span v-if="saving" class="loading loading-spinner loading-xs" />{{ saving ? '保存中' : '保存' }}</button>
    </div>
    <AppAlert v-if="alert" v-bind="alert" @close="alert = null" />
    <div v-if="loading" class="flex items-center gap-2 py-3 text-sm opacity-60"><span class="loading loading-spinner loading-sm" />正在读取常规设置...</div>
    <div v-else-if="failed" class="alert alert-error"><span>无法读取设置</span><button class="btn btn-sm" @click="load">重新加载</button></div>
    <fieldset v-else :disabled="saving" class="grid gap-4 md:grid-cols-2">
      <div class="form-control min-w-0 md:col-span-2">
        <label :for="`${timezoneListId}-trigger`" class="mb-2 block text-sm font-medium">系统时区</label>
        <div ref="timezoneDropdown" class="dropdown w-full" :class="timezoneOpen ? 'dropdown-open' : 'dropdown-close'" @focusout="timezoneFocusout">
          <button
            :id="`${timezoneListId}-trigger`"
            ref="timezoneTrigger"
            type="button"
            class="select select-bordered w-full text-left"
            aria-label="系统时区"
            aria-haspopup="listbox"
            :aria-expanded="timezoneOpen"
            :aria-controls="timezoneListId"
            @click="timezoneOpen ? closeTimezone() : openTimezone()"
            @keydown.down.prevent="openTimezone"
            @keydown.up.prevent="openTimezone"
            @keydown.esc.prevent="closeTimezone(true)"
          ><span class="truncate">{{ selected ? label(selected) : document.timezone }}</span></button>
          <div v-if="timezoneOpen" class="dropdown-content z-30 mt-2 w-full rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
            <input
              ref="timezoneSearch"
              v-model="search"
              type="search"
              class="input input-bordered mb-2 w-full"
              placeholder="搜索地区、时区或 UTC 偏移"
              aria-label="搜索时区"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              :aria-controls="timezoneListId"
              :aria-activedescendant="activeOption >= 0 ? `${timezoneListId}-${activeOption}` : undefined"
              @keydown="timezoneKeydown"
            />
            <ul :id="timezoneListId" role="listbox" aria-label="时区选项" class="max-h-64 overflow-y-auto">
              <li
                v-for="(zone, index) in options"
                :id="`${timezoneListId}-${index}`"
                :key="zone.id"
                role="option"
                :aria-selected="zone.id === document.timezone"
                :data-option-index="index"
                class="cursor-pointer rounded-lg px-3 py-2 text-sm break-words hover:bg-base-200"
                :class="{ 'bg-base-200': index === activeOption, 'font-semibold': zone.id === document.timezone }"
                @pointerdown.prevent
                @click="selectTimezone(zone)"
                @mousemove="activeOption = index"
              >{{ label(zone) }}</li>
            </ul>
            <p v-if="!options.length" role="status" class="px-3 py-4 text-sm text-base-content/60">没有匹配的时区，请尝试其他关键词。</p>
          </div>
        </div>
      </div>
      <label class="form-control"><span class="mb-2 text-sm font-medium">时间制式</span><select v-model="document.hourCycle" class="select select-bordered w-full"><option value="24">24 小时制</option><option value="12">12 小时制</option></select></label>
      <label class="form-control"><span class="mb-2 text-sm font-medium">日期格式</span><select v-model="document.dateFormat" class="select select-bordered w-full"><option value="YYYY-MM-DD">YYYY-MM-DD</option><option value="YYYY/MM/DD">YYYY/MM/DD</option><option value="DD/MM/YYYY">DD/MM/YYYY</option></select></label>
      <div class="text-xs leading-5 opacity-60 md:col-span-2"><p>当前时间预览：{{ preview }} · {{ document.timezone }}</p><p>{{ selected?.observesDst ? '此时区按日期自动处理夏令时；遇到重复时间时需选择 UTC 偏移。' : '此时区本年没有夏令时调整，无需切换夏令时或冬令时。' }}</p><p>偏移显示为当前日期的偏移。切换时区会重新安排未来报告计划；旧统计缺少原始观测时间时，需先重建分析快照。</p></div>
    </fieldset>
  </div>
</template>
