<script setup>
import { formatDateTime as formatSystemDateTime } from '@/utils/systemTime'
import { computed, onMounted, ref, useId } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import http from '@/utils/http'

const formFieldId = useId()
const alerts = ref([])
const userInfo = ref({
  username: '',
  email: '',
  userType: '--',
  createdAt: '--',
  updatedAt: '--',
  lastLoginAt: '--',
  lastLoginIp: '--',
  loginRestricted: false
})

const savedUserInfo = ref({ ...userInfo.value })
const loadingUserInfo = ref(false)
const savingUserInfo = ref(false)
const loginRecords = ref([])
const loginRecordsLoading = ref(false)
const loginRecordsFailed = ref(false)
const loginOutcome = ref('')
const loginPagination = ref({ page: 1, pageSize: 10, total: 0, totalPages: 1 })

const showSave = computed(() => (
  userInfo.value.username !== savedUserInfo.value.username
  || userInfo.value.email !== savedUserInfo.value.email
))

function pushAlert(type, title, description = '', timeout = 7000) {
  alerts.value.unshift({
    id: crypto.randomUUID(),
    type,
    title,
    description,
    timeout
  })
}

function closeAlert(id) {
  alerts.value = alerts.value.filter((alert) => alert.id !== id)
}

function formatTime(value) {
  if (value === null || value === undefined || value === '') return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return formatSystemDateTime(date)
}

function normalizeUserInfo(rawUserInfo) {
  return {
    username: rawUserInfo?.username || '',
    email: rawUserInfo?.email || '',
    userType: rawUserInfo?.role === 1 ? '管理员' : '普通用户',
    createdAt: rawUserInfo?.create_time,
    updatedAt: '--',
    lastLoginAt: rawUserInfo?.last_login_at,
    lastLoginIp: rawUserInfo?.last_login_ip || '--',
    loginRestricted: Boolean(rawUserInfo?.limit_login)
  }
}

function loginMethodLabel(value) {
  return value === 'password_totp' ? '密码 + 2FA' : '密码'
}

function loginResultLabel(value) {
  return value === 'success' ? '成功' : '失败'
}

function loginResultClass(value) {
  return value === 'success' ? 'badge-success' : 'badge-error'
}

function loginReasonLabel(value) {
  return {
    invalid_credentials: '用户名或密码错误',
    invalid_totp: '2FA 验证码错误',
    ip_not_allowlisted: '登录 IP 不在白名单中',
    legacy_login_failure: '旧版登录失败'
  }[value] || '--'
}

async function fetchLoginRecords(page = 1) {
  if (loginRecordsLoading.value) return
  loginRecordsLoading.value = true
  try {
    const params = { page, pageSize: loginPagination.value.pageSize }
    if (loginOutcome.value) params.outcome = loginOutcome.value
    const response = await http.get('/api/user/login-records', { params })
    loginRecords.value = response.data?.data || []
    loginPagination.value = response.data?.pagination || loginPagination.value
    loginRecordsFailed.value = false
  } catch (error) {
    console.error('fetch login records failed', error)
    loginRecordsFailed.value = true
    pushAlert('error', '登录记录加载失败', '请稍后重试。', 7000)
  } finally {
    loginRecordsLoading.value = false
  }
}

async function fetchUserInfo() {
  loadingUserInfo.value = true
  try {
    const response = await http.get('/api/userinfo/get')
    const rawUserInfo = Array.isArray(response.data) ? response.data[0] : response.data
    const normalizedUserInfo = normalizeUserInfo(rawUserInfo)
    userInfo.value = normalizedUserInfo
    savedUserInfo.value = { ...normalizedUserInfo }
  } catch (error) {
    console.error('fetch user info failed', error)
    pushAlert('error', '个人信息加载失败', '请稍后刷新页面重试。', 7000)
  } finally {
    loadingUserInfo.value = false
  }
}

async function saveUserInfo() {
  if (!showSave.value) return true
  if (savingUserInfo.value) return false

  savingUserInfo.value = true
  try {
    const response = await http.post('/api/userinfo/update', {
      username: userInfo.value.username,
      email: userInfo.value.email
    })

    if (response.status === 200) {
      savedUserInfo.value = { ...userInfo.value }
      pushAlert('success', '个人信息已保存', '账号资料已更新。', 5000)
      return true
    } else {
      pushAlert('error', '个人信息保存失败', '服务器未接受本次更新。', 7000)
      return false
    }
  } catch (error) {
    console.error('update user info failed', error)
    pushAlert('error', '个人信息保存失败', '请检查网络连接后重试。', 7000)
    return false
  } finally {
    savingUserInfo.value = false
  }
}

useUnsavedChanges(showSave, saveUserInfo)

onMounted(() => {
  fetchUserInfo()
  fetchLoginRecords()
})
</script>

<template>
  <div class="pointer-events-none fixed right-4 top-20 z-50 flex w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:w-auto">
    <AppAlert
      v-for="alert in alerts"
      :key="alert.id"
      class="pointer-events-auto"
      :type="alert.type"
      :title="alert.title"
      :description="alert.description"
      :timeout="alert.timeout"
      @close="closeAlert(alert.id)"
    />
  </div>

  <div class="page-shell">
    <div class="mb-5">
      <h1 class="page-title">个人信息</h1>
      <p class="mt-1 text-xs opacity-60">查看当前用户资料、登录状态和基础账号信息。</p>
    </div>

    <div class="card bg-base-100 card-border border-base-300 p-4">
      <div class="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 class="font-semibold">账号资料</h3>
          <p class="mt-1 text-xs opacity-60">用户名和邮箱可编辑，其余信息由系统记录。</p>
        </div>
        <button class="btn btn-neutral btn-sm rounded-lg" :class="showSave ? 'visible' : 'invisible'" :disabled="!showSave || savingUserInfo" @click="saveUserInfo">
          {{ savingUserInfo ? '保存中...' : '保存' }}
        </button>
      </div>

      <div v-if="loadingUserInfo" class="space-y-4">
        <div class="skeleton h-8 w-32"></div>
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div class="skeleton h-12 w-full rounded-box"></div>
          <div class="skeleton h-12 w-full rounded-box"></div>
          <div class="skeleton h-14 w-full rounded-box"></div>
          <div class="skeleton h-14 w-full rounded-box"></div>
          <div class="skeleton h-14 w-full rounded-box"></div>
          <div class="skeleton h-14 w-full rounded-box"></div>
          <div class="skeleton h-14 w-full rounded-box"></div>
          <div class="skeleton h-14 w-full rounded-box"></div>
        </div>
      </div>

      <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <fieldset class="fieldset min-w-0 w-full">
          <legend class="fieldset-legend"><label :for="`${formFieldId}-1`">用户名</label></legend>
          <input :id="`${formFieldId}-1`" v-model="userInfo.username" type="text" class="input input-bordered w-full" />
        </fieldset>

        <fieldset class="fieldset min-w-0 w-full">
          <legend class="fieldset-legend"><label :for="`${formFieldId}-2`">邮箱</label></legend>
          <input :id="`${formFieldId}-2`" v-model="userInfo.email" type="email" class="input input-bordered w-full" />
        </fieldset>

        <div class="rounded-lg bg-base-200/60 p-3">
          <div class="text-xs opacity-60">用户类型</div>
          <div class="mt-1 text-sm font-medium">{{ userInfo.userType }}</div>
        </div>

        <div class="rounded-lg bg-base-200/60 p-3">
          <div class="text-xs opacity-60">是否限制登录</div>
          <div class="mt-1 text-sm font-medium">{{ userInfo.loginRestricted ? '是' : '否' }}</div>
        </div>

        <div class="rounded-lg bg-base-200/60 p-3">
          <div class="text-xs opacity-60">创建时间</div>
          <div class="mt-1 text-sm font-medium">{{ formatTime(userInfo.createdAt) }}</div>
        </div>

        <div class="rounded-lg bg-base-200/60 p-3">
          <div class="text-xs opacity-60">更新时间</div>
          <div class="mt-1 text-sm font-medium">{{ userInfo.updatedAt }}</div>
        </div>

        <div class="rounded-lg bg-base-200/60 p-3">
          <div class="text-xs opacity-60">最后一次登录时间</div>
          <div class="mt-1 text-sm font-medium">{{ formatTime(userInfo.lastLoginAt) }}</div>
        </div>

        <div class="rounded-lg bg-base-200/60 p-3">
          <div class="text-xs opacity-60">最后一次登录 IP</div>
          <div class="mt-1 text-sm font-medium">{{ userInfo.lastLoginIp }}</div>
        </div>
      </div>
    </div>

    <div class="card bg-base-100 card-border border-base-300 mt-5 p-4">
      <div class="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 class="font-semibold">登录记录</h3>
          <p class="mt-1 text-xs opacity-60">查看账号近期的成功登录和失败尝试。</p>
        </div>
        <select v-model="loginOutcome" class="select select-bordered select-sm" :disabled="loginRecordsLoading" @change="fetchLoginRecords(1)">
          <option value="">全部结果</option>
          <option value="success">成功</option>
          <option value="failure">失败</option>
        </select>
      </div>

      <div v-if="loginRecordsLoading" class="grid min-h-36 place-items-center">
        <span class="loading loading-spinner loading-md"></span>
      </div>
      <div v-else-if="loginRecordsFailed" class="grid min-h-36 place-items-center rounded-lg bg-base-200/60 text-sm opacity-60">
        登录记录加载失败
      </div>
      <div v-else-if="loginRecords.length === 0" class="grid min-h-36 place-items-center rounded-lg bg-base-200/60 text-sm opacity-60">
        暂无登录记录
      </div>
      <div v-else class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>时间</th>
              <th>结果</th>
              <th>认证方式</th>
              <th>来源 IP</th>
              <th>说明</th>
              <th>客户端</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in loginRecords" :key="record.eventId">
              <td class="whitespace-nowrap">{{ formatTime(record.occurredAt) }}</td>
              <td><span class="badge badge-sm" :class="loginResultClass(record.outcome)">{{ loginResultLabel(record.outcome) }}</span></td>
              <td>{{ loginMethodLabel(record.authMethod) }}</td>
              <td class="font-mono text-xs">{{ record.sourceIp || '--' }}</td>
              <td>{{ loginReasonLabel(record.reasonCode) }}</td>
              <td class="max-w-72 truncate text-xs" :title="record.userAgent || ''">{{ record.userAgent || '--' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="loginRecords.length" class="mt-4 flex items-center justify-between border-t border-base-300 pt-4 text-xs">
        <span class="opacity-60">共 {{ loginPagination.total }} 条，第 {{ loginPagination.page }} / {{ loginPagination.totalPages }} 页</span>
        <div class="join">
          <button class="btn btn-sm join-item" :disabled="loginPagination.page <= 1 || loginRecordsLoading" @click="fetchLoginRecords(loginPagination.page - 1)">上一页</button>
          <button class="btn btn-sm join-item" :disabled="loginPagination.page >= loginPagination.totalPages || loginRecordsLoading" @click="fetchLoginRecords(loginPagination.page + 1)">下一页</button>
        </div>
      </div>
    </div>
  </div>
</template>
