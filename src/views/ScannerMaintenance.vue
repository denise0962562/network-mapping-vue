<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import http from '@/utils/http'

const alerts = ref([])
const loading = ref(false)
const submitting = ref(false)
const status = ref({
  enabled: false,
  phase: 'off',
  message: '',
  expected_end_at: null,
  started_at: null,
  updated_at: null,
  retry_after_seconds: 600,
  revision: 0
})
const runningTasks = ref(0)
const heldTasks = ref(0)
const form = ref({ message: '', expectedEndAt: '' })
const formRevision = ref(0)
let refreshTimer = null

const phaseLabel = computed(() => {
  if (status.value.phase === 'draining') return '正在通知'
  if (status.value.phase === 'active') return '维护中'
  return '正常运行'
})
const phaseBadge = computed(() => {
  if (status.value.phase === 'draining') return 'badge-warning'
  if (status.value.phase === 'active') return 'badge-error'
  return 'badge-success'
})
const expectedEndOverdue = computed(() => (
  status.value.enabled
  && status.value.expected_end_at
  && new Date(status.value.expected_end_at).getTime() < Date.now()
))

function pushAlert(type, title, description = '') {
  alerts.value.unshift({ id: crypto.randomUUID(), type, title, description, timeout: 7000 })
}

function closeAlert(id) {
  alerts.value = alerts.value.filter((alert) => alert.id !== id)
}

function formatTime(value) {
  if (!value) return '未设置'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function toLocalDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function applyResponse(data, { syncForm = true } = {}) {
  if (!data?.data) throw new Error('服务器未返回有效维护状态')
  status.value = data.data
  runningTasks.value = Number(data.running_tasks) || 0
  heldTasks.value = Number(data.held_tasks) || 0
  if (syncForm) {
    form.value = {
      message: data.data.message || '',
      expectedEndAt: toLocalDateTime(data.data.expected_end_at)
    }
    formRevision.value = data.data.revision
  }
}

function requestPayload() {
  return {
    message: form.value.message.trim(),
    expectedEndAt: form.value.expectedEndAt
      ? new Date(form.value.expectedEndAt).toISOString()
      : null
  }
}

async function loadStatus({ silent = false } = {}) {
  if (!silent) loading.value = true
  try {
    const response = await http.get('/api/admin/scanner-maintenance')
    applyResponse(response.data, { syncForm: !silent })
  } catch (error) {
    console.error('load scanner maintenance failed', error)
    if (!silent) pushAlert('error', '维护状态加载失败', error?.response?.data?.message || '请稍后重试。')
  } finally {
    if (!silent) loading.value = false
  }
}

async function enterMaintenance() {
  if (!form.value.message.trim()) {
    pushAlert('warning', '请输入维护说明')
    return
  }
  if (!window.confirm('进入后将停止分配新任务，并通知活动 Scanner 继续在本地完成扫描。约 60 秒后即可关闭服务端，结果将在退出维护后补传。确认继续吗？')) return
  submitting.value = true
  try {
    const response = await http.post('/api/admin/scanner-maintenance/enter', requestPayload())
    applyResponse(response.data)
    pushAlert('success', '已开始进入维护模式', heldTasks.value > 0 ? `正在通知 ${heldTasks.value} 个活动任务，任务不会阻塞服务端维护。` : '当前没有活动任务。')
  } catch (error) {
    pushAlert('error', '进入维护模式失败', error?.response?.data?.message || '请稍后重试。')
  } finally {
    submitting.value = false
  }
}

async function updateMaintenance() {
  if (!form.value.message.trim()) {
    pushAlert('warning', '请输入维护说明')
    return
  }
  submitting.value = true
  try {
    const response = await http.patch('/api/admin/scanner-maintenance', {
      ...requestPayload(),
      revision: formRevision.value
    })
    applyResponse(response.data)
    pushAlert('success', '维护信息已更新')
  } catch (error) {
    pushAlert('error', '维护信息更新失败', error?.response?.data?.message || '状态可能已变化，请刷新后重试。')
  } finally {
    submitting.value = false
  }
}

async function exitMaintenance() {
  if (!window.confirm('确认手动退出维护模式吗？Scanner 将在下一次探测后恢复，最长约 10 分钟。')) return
  submitting.value = true
  try {
    const response = await http.post('/api/admin/scanner-maintenance/exit', {
      revision: status.value.revision
    })
    applyResponse(response.data)
    pushAlert('success', '已退出维护模式', 'Scanner 将在下一次维护探测后恢复运行。')
  } catch (error) {
    pushAlert('error', '退出维护模式失败', error?.response?.data?.message || '状态可能已变化，请刷新后重试。')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadStatus()
  refreshTimer = window.setInterval(() => loadStatus({ silent: true }), 5000)
})

onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
})
</script>

<template>
  <main class="p-4 md:p-6">
    <div class="fixed right-4 top-20 z-50 flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-2">
      <AppAlert
        v-for="alert in alerts"
        :key="alert.id"
        v-bind="alert"
        @close="closeAlert(alert.id)"
      />
    </div>

    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">扫描服务维护</h1>
        <p class="mt-1 text-sm text-base-content/60">暂停 Scanner 任务流，活动扫描在本地完成并于维护结束后补传。</p>
      </div>
      <button class="btn btn-ghost btn-sm" :disabled="loading" @click="loadStatus()">
        {{ loading ? '刷新中…' : '刷新状态' }}
      </button>
    </div>

    <div v-if="expectedEndOverdue" role="alert" class="alert alert-warning mb-4">
      <span>已超过预计结束时间，维护模式不会自动退出，请确认维护进度并手动退出。</span>
    </div>

    <section class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body gap-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <h2 class="card-title">当前状态</h2>
            <span class="badge" :class="phaseBadge">{{ phaseLabel }}</span>
          </div>
          <div v-if="status.enabled" class="text-sm text-base-content/70">
            Scanner 每约 {{ Math.round(status.retry_after_seconds / 60) }} 分钟探测一次
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div class="rounded-box bg-base-200 p-4">
            <div class="text-xs text-base-content/60">运行中任务</div>
            <div class="mt-1 text-2xl font-semibold">{{ runningTasks }}</div>
          </div>
          <div class="rounded-box bg-base-200 p-4">
            <div class="text-xs text-base-content/60">维护冻结任务</div>
            <div class="mt-1 text-2xl font-semibold">{{ heldTasks }}</div>
          </div>
          <div class="rounded-box bg-base-200 p-4">
            <div class="text-xs text-base-content/60">开始时间</div>
            <div class="mt-1 text-sm font-medium">{{ formatTime(status.started_at) }}</div>
          </div>
          <div class="rounded-box bg-base-200 p-4">
            <div class="text-xs text-base-content/60">预计结束</div>
            <div class="mt-1 text-sm font-medium">{{ formatTime(status.expected_end_at) }}</div>
          </div>
          <div class="rounded-box bg-base-200 p-4">
            <div class="text-xs text-base-content/60">状态版本</div>
            <div class="mt-1 text-sm font-medium">{{ status.revision }}</div>
          </div>
        </div>

        <div v-if="status.phase === 'draining'" role="alert" class="alert alert-warning">
          <span>已冻结活动任务租约并通过心跳通知 Scanner。通知窗口最多约 {{ status.notification_grace_seconds || 60 }} 秒，任务无需完成也不会阻塞正式维护。</span>
        </div>
        <div v-else-if="status.phase === 'active'" role="alert" class="alert alert-error">
          <span>可安全停止服务端。Scanner 会在本地完成活动扫描并缓存结果；手动退出维护后有 {{ status.result_upload_grace_hours || 24 }} 小时补传，随后未完成任务才会重新排队。</span>
        </div>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">维护说明</legend>
          <textarea
            v-model="form.message"
            class="textarea textarea-bordered min-h-28 w-full"
            maxlength="500"
            placeholder="例如：数据库升级与索引维护"
          ></textarea>
          <div class="label text-xs text-base-content/60">该说明会返回给 Scanner，请勿填写凭据、内部地址等敏感信息。</div>
        </fieldset>

        <fieldset class="fieldset max-w-md">
          <legend class="fieldset-legend">预计结束时间（可选）</legend>
          <input v-model="form.expectedEndAt" type="datetime-local" class="input input-bordered w-full" />
          <div class="label text-xs text-base-content/60">到达该时间不会自动退出维护模式。</div>
        </fieldset>

        <div class="card-actions justify-end">
          <button
            v-if="!status.enabled"
            class="btn btn-warning"
            :disabled="submitting || !form.message.trim()"
            @click="enterMaintenance"
          >
            {{ submitting ? '处理中…' : '进入维护模式' }}
          </button>
          <template v-else>
            <button class="btn btn-outline" :disabled="submitting || !form.message.trim()" @click="updateMaintenance">
              更新维护信息
            </button>
            <button class="btn btn-error" :disabled="submitting" @click="exitMaintenance">
              手动退出维护模式
            </button>
          </template>
        </div>
      </div>
    </section>
  </main>
</template>
