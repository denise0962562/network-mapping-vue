<script setup>
import { computed, onMounted, ref } from 'vue'
import http from '@/utils/http'

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
const showOperationLogs = ref(true)
const operationLogs = ref([
  { id: 1, action: '更新邮箱', ip: '192.168.1.10', time: '2026-05-20 13:50:18', status: '成功', remark: '' },
  { id: 2, action: '登录系统', ip: '192.168.1.10', time: '2026-05-20 13:48:12', status: '成功', remark: '' },
  { id: 3, action: '查看安全设置', ip: '192.168.1.10', time: '2026-05-19 18:22:40', status: '成功', remark: '' }
])

const visibleOperationLogs = computed(() => (showOperationLogs.value ? operationLogs.value : []))

const showSave = computed(() => (
  userInfo.value.username !== savedUserInfo.value.username
  || userInfo.value.email !== savedUserInfo.value.email
))

function formatTime(value) {
  if (value === null || value === undefined || value === '') return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('zh-CN', { hour12: false })
}

function normalizeUserInfo(rawUserInfo) {
  return {
    username: rawUserInfo?.username || '',
    email: rawUserInfo?.email || '',
    userType: rawUserInfo?.role === 1 ? '管理员' : '普通用户',
    createdAt: formatTime(rawUserInfo?.create_time),
    updatedAt: '--',
    lastLoginAt: formatTime(rawUserInfo?.last_login_at),
    lastLoginIp: rawUserInfo?.last_login_ip || '--',
    loginRestricted: Boolean(rawUserInfo?.limit_login)
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
  } finally {
    loadingUserInfo.value = false
  }
}

async function saveUserInfo() {
  if (!showSave.value || savingUserInfo.value) return

  savingUserInfo.value = true
  try {
    const response = await http.post('/api/userinfo/update', {
      username: userInfo.value.username,
      email: userInfo.value.email
    })

    if (response.status === 200) {
      savedUserInfo.value = { ...userInfo.value }
    }
  } catch (error) {
    console.error('update user info failed', error)
  } finally {
    savingUserInfo.value = false
  }
}

onMounted(() => {
  fetchUserInfo()
})
</script>

<template>
  <div class="p-5">
    <div class="mb-5">
      <h2 class="text-lg font-semibold">个人信息</h2>
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

      <div v-if="loadingUserInfo" class="grid min-h-36 place-items-center rounded-lg bg-base-200/60 text-sm opacity-60">
        加载中...
      </div>

      <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <label class="form-control w-full">
          <span class="label-text mb-1">用户名</span>
          <input v-model="userInfo.username" type="text" class="input input-bordered w-full" />
        </label>

        <label class="form-control w-full">
          <span class="label-text mb-1">邮箱</span>
          <input v-model="userInfo.email" type="email" class="input input-bordered w-full" />
        </label>

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
          <div class="mt-1 text-sm font-medium">{{ userInfo.createdAt }}</div>
        </div>

        <div class="rounded-lg bg-base-200/60 p-3">
          <div class="text-xs opacity-60">更新时间</div>
          <div class="mt-1 text-sm font-medium">{{ userInfo.updatedAt }}</div>
        </div>

        <div class="rounded-lg bg-base-200/60 p-3">
          <div class="text-xs opacity-60">最后一次登录时间</div>
          <div class="mt-1 text-sm font-medium">{{ userInfo.lastLoginAt }}</div>
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
          <h3 class="font-semibold">最近操作</h3>
          <p class="mt-1 text-xs opacity-60">显示当前用户最近的关键操作日志。</p>
        </div>
        <button type="button" class="btn btn-neutral btn-sm rounded-lg" @click="showOperationLogs = !showOperationLogs">
          {{ showOperationLogs ? '显示无数据' : '显示日志' }}
        </button>
      </div>

      <div v-if="visibleOperationLogs.length === 0" class="grid min-h-36 place-items-center rounded-lg bg-base-200/60 text-sm opacity-60">
        无数据
      </div>

      <div v-else class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>操作</th>
              <th>IP</th>
              <th>时间</th>
              <th>状态</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in visibleOperationLogs" :key="log.id">
              <td>{{ log.action }}</td>
              <td>{{ log.ip }}</td>
              <td>{{ log.time }}</td>
              <td>{{ log.status }}</td>
              <td>{{ log.remark }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
