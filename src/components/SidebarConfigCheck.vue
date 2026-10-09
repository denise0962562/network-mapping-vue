<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useConfigCheck } from '@/composables/useConfigCheck'

const props = defineProps({ expanded: { type: Boolean, default: true } })
const { snapshot, loading, error, previewMode, load } = useConfigCheck(() => '/api/config/check')
const anchor = ref(null)
const tooltip = ref(null)
const tooltipId = useId()
const hovering = ref(false)
const focused = ref(false)
const dismissed = ref(false)
const tooltipVisible = computed(() => (hovering.value || focused.value) && !dismissed.value)
const tooltipStyle = ref({})
const defaults = computed(() => snapshot.value?.items.filter((item) => item.kind === 'default').length || 0)
const required = computed(() => snapshot.value?.items.filter((item) => item.kind === 'required').length || 0)
const optional = computed(() => snapshot.value?.items.filter((item) => item.kind === 'optional').length || 0)
const label = computed(() => {
  if (loading.value) return '配置检查中'
  if (error.value || !snapshot.value) return '配置检查待确认'
  if (required.value) return `${required.value} 项配置缺失`
  if (defaults.value) return `${defaults.value} 项配置提示`
  return '配置检查通过'
})
const summary = computed(() => {
  if (loading.value) return '正在读取最近一次启动时的配置检查结果。'
  if (error.value) return `${error.value} 点击进入配置检查页面重试。`
  if (!snapshot.value) return '尚未收到配置检查结果，点击进入配置检查页面查看。'
  if (required.value) return `${required.value} 个必需参数缺失，需要按字段说明补齐；另有 ${defaults.value} 个字段采用缺省处理。`
  if (defaults.value) return `${defaults.value} 个字段未显式配置，当前采用兼容默认值或数据库初始化种子，可按需补充。`
  return optional.value ? `没有需要补充的启动参数。${optional.value} 个未启用功能的可选参数无需补齐。` : '当前没有需要补充的启动参数。'
})
const destination = computed(() => ({
  path: '/setting',
  query: previewMode.value ? { 'config-check-preview': '1' } : {},
}))

async function updatePosition() {
  if (!tooltipVisible.value) return
  const width = Math.min(320, window.innerWidth - 24)
  tooltipStyle.value = { ...tooltipStyle.value, position: 'fixed', width: `${width}px` }
  await nextTick()
  if (!tooltipVisible.value || !anchor.value || !tooltip.value) return
  const rect = anchor.value.$el.getBoundingClientRect()
  const height = tooltip.value.offsetHeight
  tooltipStyle.value = {
    position: 'fixed',
    width: `${width}px`,
    left: `${Math.max(12, Math.min(rect.right + 12, window.innerWidth - width - 12))}px`,
    top: `${Math.max(12, Math.min(rect.top + rect.height / 2 - height / 2, window.innerHeight - height - 12))}px`,
  }
}

function activate(kind) {
  dismissed.value = false
  if (kind === 'hover') hovering.value = true
  else focused.value = true
}

watch([tooltipVisible, () => props.expanded, summary], updatePosition)
watch(previewMode, () => load())
onMounted(() => {
  load()
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
})
</script>

<template>
  <div class="w-full px-2 pb-2">
    <router-link
      ref="anchor"
      :to="destination"
      class="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="[expanded ? '' : 'justify-center', required ? 'text-warning' : 'text-info']"
      :aria-label="`${label}，点击查看启动配置检查`"
      :aria-describedby="tooltipVisible ? tooltipId : undefined"
      @mouseenter="activate('hover')"
      @mouseleave="hovering = false"
      @focus="activate('focus')"
      @blur="focused = false"
      @keydown.esc="dismissed = true"
      @click="dismissed = true"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" /><path d="M12 8h.01" />
      </svg>
      <span v-if="expanded" class="truncate">{{ label }}</span>
    </router-link>
    <Teleport to="body">
      <div v-if="tooltipVisible" ref="tooltip" class="tooltip tooltip-right tooltip-open pointer-events-none z-[60] after:hidden" :style="tooltipStyle">
        <div :id="tooltipId" role="tooltip" class="tooltip-content p-3 text-left leading-5" style="position: static; width: 100%; max-width: none; transform: none;">
          <p class="font-semibold">启动配置检查<span v-if="previewMode" class="ml-2 text-xs opacity-70">演示</span></p>
          <p class="mt-1">{{ summary }}</p>
          <p class="mt-2 text-xs opacity-80">文件部署与 Docker 挂载配置均适用。检查不会改写配置文件；修改后需重启对应进程。</p>
          <p class="mt-2 text-xs opacity-80">点击查看字段、内置缺省值和处理说明。扫描器配置请在对应扫描器的配置页面查看。</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>
