<script setup>
import { onBeforeUnmount, ref } from 'vue'
import http from '@/utils/http'

const ip = ref('')
const port = ref('')
const level = ref(1)
const remark = ref('')
const alertType = ref('')
const submitting = ref(false)

const ipInputRef = ref(null)
const portInputRef = ref(null)

let alertTimer = null

function closeAlert() {
  alertType.value = ''
  if (alertTimer) {
    clearTimeout(alertTimer)
    alertTimer = null
  }
}

function showAlertFor5Seconds(type) {
  closeAlert()
  alertType.value = type
  alertTimer = setTimeout(() => {
    alertType.value = ''
    alertTimer = null
  }, 5000)
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

    if (response.status === 200) showAlertFor5Seconds('success')
    else showAlertFor5Seconds('error')
  } catch {
    showAlertFor5Seconds('error')
  } finally {
    submitting.value = false
  }
}

onBeforeUnmount(() => {
  if (alertTimer) {
    clearTimeout(alertTimer)
  }
})
</script>

<template>
  <transition name="alert-slide">
    <div v-if="alertType" class="fixed right-4 top-4 z-50">
      <div role="alert" :class="['alert', 'alert-soft', alertType === 'success' ? 'alert-success' : 'alert-error']">
        <span>{{ alertType === 'success' ? '创建扫描任务成功' : '创建扫描失败' }}</span>
        <button class="btn btn-xs btn-ghost" @click="closeAlert" aria-label="关闭提示">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
    </div>
  </transition>

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

.alert-slide-enter-active,
.alert-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.alert-slide-enter-from,
.alert-slide-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

.alert-slide-enter-to,
.alert-slide-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
