<script setup>
import { onMounted, ref, watch } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import http from '@/utils/http'

const DRAFT_KEY = 'createscan_draft'

const ip = ref('')
const port = ref('')
const level = ref(1)
const remark = ref('')
const alerts = ref([])
const submitting = ref(false)

const ipInputRef = ref(null)
const portInputRef = ref(null)

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    ip: ip.value,
    port: port.value,
    level: level.value,
    remark: remark.value,
  }))
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return
    const draft = JSON.parse(raw)
    if (draft.ip !== undefined) ip.value = draft.ip
    if (draft.port !== undefined) port.value = draft.port
    if (draft.level !== undefined) level.value = Number(draft.level)
    if (draft.remark !== undefined) remark.value = draft.remark
  } catch {
    localStorage.removeItem(DRAFT_KEY)
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY)
}

watch([ip, port, level, remark], saveDraft)

onMounted(loadDraft)

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
  if (!ipInputRef.value?.reportValidity()) return
  if (port.value && !portInputRef.value?.reportValidity()) return

  try {
    submitting.value = true

    const payload = {
      ip: ip.value.trim(),
      port: port.value.trim(),
      level: Number(level.value),
      remark: remark.value.trim() ? remark.value.trim() : null,
    }

    const response = await http.post('/api/task/create', payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (response.status === 200) {
      clearDraft()
      showAlert('success', '创建扫描任务成功', '任务已提交到扫描队列。', 5000)
    } else {
      showAlert('error', '创建扫描失败', '服务器未接受本次创建请求。', 7000)
    }
  } catch (error) {
    console.error('create scan task failed', error)
    showAlert('error', '创建扫描失败', '请检查网络连接或服务器运行状态。', 7000)
  } finally {
    submitting.value = false
  }
}
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
