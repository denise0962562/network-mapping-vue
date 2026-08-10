<script setup>
import { computed, onMounted, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import http from '@/utils/http'

const LEGACY_DRAFT_KEY = 'createscan_draft'

const ip = ref('')
const port = ref('')
const level = ref(1)
const remark = ref('')
const alerts = ref([])
const submitting = ref(false)
const dispatchMode = ref('automatic')
const scannerIds = ref([])
const scanners = ref([])
const scannersLoading = ref(false)

const ipInputRef = ref(null)
const portInputRef = ref(null)
const hasUnsavedChanges = computed(() => (
  ip.value.trim() !== ''
  || port.value.trim() !== ''
  || level.value !== 1
  || remark.value.trim() !== ''
  || dispatchMode.value !== 'automatic'
  || scannerIds.value.length > 0
))

function resetForm() {
  ip.value = ''
  port.value = ''
  level.value = 1
  remark.value = ''
  dispatchMode.value = 'automatic'
  scannerIds.value = []
}

async function loadScanners() {
  scannersLoading.value = true
  try {
    const response = await http.get('/api/scanner/list')
    const data = response.data?.data
    if (!Array.isArray(data)) throw new Error('invalid scanner list')
    scanners.value = data.filter((item) => item.is_enable === true)
    const validIds = new Set(scanners.value.map((item) => item.scanner_id))
    scannerIds.value = scannerIds.value.filter((id) => validIds.has(id))
  } catch (error) {
    console.error('load scanners failed', error)
    showAlert('error', '扫描器列表加载失败', '指定扫描器暂不可用，请稍后刷新。', 7000)
  } finally {
    scannersLoading.value = false
  }
}

onMounted(() => {
  localStorage.removeItem(LEGACY_DRAFT_KEY)
  loadScanners()
})

function closeAlertById(id) {
  alerts.value = alerts.value.filter((alert) => alert.id !== id)
}

function showAlert(type, title, description = '', timeout = 5000) {
  alerts.value.unshift({
    id: crypto.randomUUID(),
    type,
    title,
    description,
    timeout
  })
}

async function submitTask() {
  if (submitting.value) return false
  if (!ipInputRef.value?.reportValidity()) return false
  if (port.value && !portInputRef.value?.reportValidity()) return false
  if (dispatchMode.value === 'selected' && scannerIds.value.length === 0) {
    showAlert('warning', '请选择扫描器', '指定扫描器模式至少需要选择一台扫描器。')
    return false
  }

  try {
    submitting.value = true

    const payload = {
      ip: ip.value.trim(),
      port: port.value.trim(),
      level: Number(level.value),
      remark: remark.value.trim() ? remark.value.trim() : null,
      dispatch_mode: dispatchMode.value,
      scanner_ids: dispatchMode.value === 'selected' ? scannerIds.value : [],
    }

    const response = await http.post('/api/task/create', payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (response.status === 200) {
      resetForm()
      showAlert('success', '创建扫描任务成功', '任务已提交到扫描队列。', 5000)
      return true
    } else {
      showAlert('error', '创建扫描失败', '服务器未接受本次创建请求。', 7000)
      return false
    }
  } catch (error) {
    console.error('create scan task failed', error)
    showAlert('error', '创建扫描失败', '请检查网络连接或服务器运行状态。', 7000)
    return false
  } finally {
    submitting.value = false
  }
}

useUnsavedChanges(hasUnsavedChanges, submitTask)
</script>

<template>
  <div class="pointer-events-none fixed top-20 left-1/2 z-50 flex w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2 sm:left-auto sm:right-5 sm:w-auto sm:translate-x-0 sm:items-end">
    <AppAlert
      v-for="alert in alerts"
      :key="alert.id"
      class="pointer-events-auto"
      :type="alert.type"
      :title="alert.title"
      :description="alert.description"
      :timeout="alert.timeout"
      @close="closeAlertById(alert.id)"
    />
  </div>

  <div class="flex justify-center">
    <div class="card bg-base-100 card-border m-2.5 border-base-300 w-[85%] p-5">
      <div class="grid grid-cols-1 gap-4">
        <label class="form-control w-full">
          <span class="label-text input_items_required">目标 IP</span>
          <input
            id="create_task_ip"
            ref="ipInputRef"
            v-model="ip"
            class="task_input_items peer"
            type="text"
            required
            placeholder="请输入目标 IP 或 CIDR，多个目标请使用 , 隔开"
            pattern="^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\/([0-9]|[1-2]\d|3[0-2]))?(,((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\/([0-9]|[1-2]\d|3[0-2]))?)*$"
          />
          <div class="max-h-0 overflow-hidden opacity-0 transition-all duration-200 ease-in-out peer-[&:not(:placeholder-shown):invalid]:mt-1 peer-[&:not(:placeholder-shown):invalid]:max-h-10 peer-[&:not(:placeholder-shown):invalid]:opacity-100 text-error text-xs">
            请输入正确的目标地址
          </div>
        </label>

        <fieldset class="rounded-lg border border-base-300 p-4">
          <legend class="px-2 text-sm font-medium">执行扫描器</legend>
          <div class="grid gap-2 md:grid-cols-3">
            <label class="flex cursor-pointer items-start gap-2 rounded-lg bg-base-200/50 p-3">
              <input v-model="dispatchMode" class="radio radio-sm mt-0.5" type="radio" value="automatic" />
              <span><span class="block font-medium">自动分配</span><span class="text-xs opacity-60">任意可用扫描器执行一次</span></span>
            </label>
            <label class="flex cursor-pointer items-start gap-2 rounded-lg bg-base-200/50 p-3">
              <input v-model="dispatchMode" class="radio radio-sm mt-0.5" type="radio" value="selected" />
              <span><span class="block font-medium">指定扫描器</span><span class="text-xs opacity-60">选择一台或多台分别执行</span></span>
            </label>
            <label class="flex cursor-pointer items-start gap-2 rounded-lg bg-base-200/50 p-3">
              <input v-model="dispatchMode" class="radio radio-sm mt-0.5" type="radio" value="all" />
              <span><span class="block font-medium">全部扫描器</span><span class="text-xs opacity-60">所有已启用扫描器各执行一次，离线设备上线后执行</span></span>
            </label>
          </div>
          <div v-if="dispatchMode === 'selected'" class="mt-3 rounded-lg border border-base-300 p-3">
            <div v-if="scannersLoading" class="flex items-center gap-2 text-sm opacity-70"><span class="loading loading-spinner loading-xs"></span>加载扫描器...</div>
            <div v-else-if="scanners.length === 0" class="text-sm opacity-70">暂无已启用扫描器</div>
            <div v-else class="grid gap-2 md:grid-cols-2">
              <label v-for="scanner in scanners" :key="scanner.scanner_id" class="flex cursor-pointer items-center gap-3 rounded-lg bg-base-200/50 px-3 py-2">
                <input v-model="scannerIds" class="checkbox checkbox-sm" type="checkbox" :value="scanner.scanner_id" />
                <span class="min-w-0"><span class="block truncate text-sm font-medium">{{ scanner.name || '未命名扫描器' }}</span><span class="block truncate text-xs opacity-60">{{ scanner.location || '未设置位置' }} · {{ scanner.is_online ? '在线' : '离线（等待上线）' }}</span></span>
              </label>
            </div>
          </div>
        </fieldset>

        <label class="form-control w-full">
          <span class="label-text input_items_required">目标端口</span>
          <input
            id="create_task_port"
            ref="portInputRef"
            v-model="port"
            class="task_input_items peer"
            type="text"
            placeholder="请输入目标端口，留空默认全端口"
            pattern="^((6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3})(-(6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}))?)(,((6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3})(-(6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}))?))*$"
          />
          <div class="max-h-0 overflow-hidden opacity-0 transition-all duration-200 ease-in-out peer-[&:not(:placeholder-shown):invalid]:mt-1 peer-[&:not(:placeholder-shown):invalid]:max-h-10 peer-[&:not(:placeholder-shown):invalid]:opacity-100 text-error text-xs">
            请输入正确的端口
          </div>
        </label>

        <label class="form-control w-full">
          <span class="label-text mb-1">优先级</span>
          <select v-model.number="level" class="select w-full">
            <option value="1">低级</option>
            <option value="0">最低（与系统自动生成扫描任务级别一致）</option>
            <option value="2">中级</option>
            <option value="3">高级</option>
            <option value="4">紧急</option>
          </select>
        </label>

        <label class="form-control w-full">
          <span class="label-text mb-1 text-base-content/60">备注</span>
          <textarea
            id="create_task_remark"
            v-model="remark"
            class="textarea w-full"
            placeholder="备注，最长不超过 200 个字符"
            maxlength="200"
          ></textarea>
        </label>
      </div>

      <div class="flex justify-end mt-3">
        <button id="task_submit" class="btn rounded-lg btn-neutral w-full md:w-auto" :disabled="submitting" @click="submitTask">
          {{ submitting ? '提交中...' : '提交' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task_input_items,
.textarea,
.select {
  text-align: left;
}

.task_input_items::placeholder,
.textarea::placeholder {
  text-align: left;
}

</style>
