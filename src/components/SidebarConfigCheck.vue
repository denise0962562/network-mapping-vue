<script setup>
import { tr } from '../i18n/index.js'

import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useConfigCheck } from '@/composables/useConfigCheck'
import { deploymentConfigItems } from '@/utils/configCheck'

const props = defineProps({ expanded: { type: Boolean, default: true } })
const { snapshot, loading, error, load } = useConfigCheck(() => '/api/config/check')
const anchor = ref(null)
const tooltip = ref(null)
const tooltipId = useId()
const hovering = ref(false)
const focused = ref(false)
const dismissed = ref(false)
const tooltipStyle = ref({})
const items = computed(() => deploymentConfigItems(snapshot.value))
const defaults = computed(() => items.value.filter((item) => item.kind === 'default').length)
const required = computed(() => items.value.filter((item) => item.kind === 'required').length)
const optional = computed(() => items.value.filter((item) => item.kind === 'optional').length)
const showIndicator = computed(() => Boolean(error.value) || defaults.value > 0 || required.value > 0)
const tooltipVisible = computed(() => showIndicator.value && (hovering.value || focused.value) && !dismissed.value)
const label = computed(() => {
  if (loading.value) return tr("配置检查中")
  if (error.value || !snapshot.value) return tr("配置检查待确认")
  if (required.value) return tr("{0} 项配置缺失", [required.value])
  if (defaults.value) return tr("{0} 项配置提示", [defaults.value])
  return tr("配置检查通过")
})
const summary = computed(() => {
  if (loading.value) return tr("正在读取最近一次启动时的配置检查结果。")
  if (error.value) return tr("{0} 点击进入配置检查页面重试。", [error.value])
  if (!snapshot.value) return tr("尚未收到配置检查结果，点击进入配置检查页面查看。")
  if (required.value) return tr("{0} 个必需参数缺失，需要按字段说明补齐；另有 {1} 个字段采用缺省处理。", [required.value, defaults.value])
  if (defaults.value) return tr("{0} 个部署字段未显式配置，当前采用兼容默认值，可按需补充。", [defaults.value])
  return optional.value ? tr("没有需要补充的启动参数。{0} 个未启用功能的可选参数无需补齐。", [optional.value]) : tr("当前没有需要补充的启动参数。")
})

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
watch(showIndicator, (visible) => {
  if (visible) return
  hovering.value = false
  focused.value = false
  dismissed.value = false
})
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
  <div v-if="showIndicator" class="w-full px-2 pb-2">
    <router-link
      ref="anchor"
      to="/setting"
      class="flex min-h-10 items-center justify-center gap-2 rounded-lg px-2 text-sm opacity-60 hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :aria-label="tr(&quot;{0}，点击查看启动配置检查&quot;, [label])"
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
          <p class="font-semibold">{{ tr("启动配置检查") }}</p>
          <p class="mt-1">{{ summary }}</p>
          <p class="mt-2 text-xs opacity-80">{{ tr("仅提示部署文件参数，Web 管理的数据库参数不列入提示。文件与 Docker 部署均适用；修改文件后需重启对应进程。") }}</p>
          <p class="mt-2 text-xs opacity-80">{{ tr("点击查看字段、内置缺省值和处理说明。扫描器配置请在对应扫描器的配置页面查看。") }}</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>
