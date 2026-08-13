<script setup>
import { computed, onMounted, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import http from '@/utils/http'

const alerts = ref([])
const users = ref([])
const stats = ref({ total: 0, active: 0, disabled: 0, locked: 0, activeSessions: 0 })
const pagination = ref({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
const filters = ref({ query: '', role: '', status: 'all' })
const loading = ref(false)
const initialLoadFailed = ref(false)
const actionUserId = ref(null)
const creating = ref(false)
const createDialog = ref(null)
const deleteDialog = ref(null)
const deleteTarget = ref(null)
const deleteConfirmation = ref('')
const showPassword = ref(false)
const createForm = ref(emptyCreateForm())

function emptyCreateForm() {
  return { username: '', email: '', password: '', role: 2 }
}

function pushAlert(type, title, description = '', timeout = 7000) {
  alerts.value.unshift({ id: crypto.randomUUID(), type, title, description, timeout })
}

function closeAlert(id) {
  alerts.value = alerts.value.filter((alert) => alert.id !== id)
}

function apiMessage(error, fallback) {
  if (error?.response?.status === 403) return '仅管理员可以执行此操作。'
  return error?.response?.data?.message || fallback
}

function formatTime(value) {
  if (value === null || value === undefined || value === '') return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('zh-CN', { hour12: false })
}

function statusInfo(status) {
  const values = {
    active: { label: '正常', class: 'badge-success' },
    disabled: { label: '已禁用', class: 'badge-error' },
    locked: { label: '登录锁定', class: 'badge-warning' },
    deleted: { label: '已删除', class: 'badge-ghost' }
  }
  return values[status] || { label: status || '未知', class: 'badge-ghost' }
}

const hasUsers = computed(() => users.value.length > 0)
const canDelete = computed(() => (
  deleteTarget.value && deleteConfirmation.value === deleteTarget.value.username
))

async function loadUsers({ page = pagination.value.page, silent = false } = {}) {
  if (loading.value) return
  loading.value = true
  try {
    const params = {
      page,
      pageSize: pagination.value.pageSize,
      status: filters.value.status
    }
    if (filters.value.query.trim()) params.query = filters.value.query.trim()
    if (filters.value.role) params.role = Number(filters.value.role)
    const response = await http.get('/api/admin/users', { params })
    if (response.data?.success !== true || !Array.isArray(response.data?.data)) {
      throw new Error('服务器未返回有效用户列表')
    }
    users.value = response.data.data
    stats.value = response.data.stats || stats.value
    pagination.value = response.data.pagination || pagination.value
    initialLoadFailed.value = false
  } catch (error) {
    console.error('load managed users failed', error)
    initialLoadFailed.value = users.value.length === 0
    if (!silent) pushAlert('error', '用户列表加载失败', apiMessage(error, '请稍后重试。'))
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  loadUsers({ page: 1 })
}

function clearFilters() {
  filters.value = { query: '', role: '', status: 'all' }
  loadUsers({ page: 1 })
}

function openCreateDialog() {
  createForm.value = emptyCreateForm()
  showPassword.value = false
  createDialog.value?.showModal()
}

function closeCreateDialog() {
  createDialog.value?.close()
}

function validateCreateForm() {
  const usernameLength = createForm.value.username.trim().length
  if (usernameLength < 3 || usernameLength > 64) return '用户名长度必须为 3-64 个字符'
  const passwordLength = createForm.value.password.length
  if (passwordLength < 12 || passwordLength > 256) return '密码长度必须为 12-256 个字符'
  return ''
}

async function createUser() {
  if (creating.value) return
  const validationMessage = validateCreateForm()
  if (validationMessage) {
    pushAlert('warning', '创建信息不完整', validationMessage)
    return
  }
  creating.value = true
  try {
    await http.post('/api/admin/users', {
      username: createForm.value.username.trim(),
      email: createForm.value.email.trim() || null,
      password: createForm.value.password,
      role: Number(createForm.value.role)
    })
    closeCreateDialog()
    pushAlert('success', '用户已创建', `${createForm.value.username.trim()} 现在可以登录系统。`, 5000)
    await loadUsers({ page: 1, silent: true })
  } catch (error) {
    console.error('create managed user failed', error)
    pushAlert('error', '创建用户失败', apiMessage(error, '请检查输入后重试。'))
  } finally {
    creating.value = false
  }
}

async function runUserAction(user, request, successTitle, successDescription = '') {
  if (actionUserId.value !== null) return false
  actionUserId.value = user.id
  try {
    const response = await request()
    pushAlert('success', successTitle, response.data?.message || successDescription, 5000)
    await loadUsers({ silent: true })
    return true
  } catch (error) {
    console.error('managed user action failed', error)
    pushAlert('error', '用户操作失败', apiMessage(error, '请稍后重试。'))
    return false
  } finally {
    actionUserId.value = null
  }
}

function toggleUser(user) {
  const enabled = user.status === 'disabled'
  const actionLabel = enabled ? '启用' : '禁用'
  const warning = enabled
    ? `确定启用用户“${user.username}”吗？`
    : `确定禁用用户“${user.username}”吗？该用户的现有会话会立即失效。`
  if (!window.confirm(warning)) return
  runUserAction(
    user,
    () => http.patch(`/api/admin/users/${user.id}/status`, { enabled }),
    `用户已${actionLabel}`
  )
}

function kickUser(user) {
  if (!window.confirm(`确定踢出用户“${user.username}”吗？该用户需要重新登录。`)) return
  runUserAction(
    user,
    () => http.post(`/api/admin/users/${user.id}/kick`),
    '用户会话已处理'
  )
}

function openDeleteDialog(user) {
  deleteTarget.value = user
  deleteConfirmation.value = ''
  deleteDialog.value?.showModal()
}

function closeDeleteDialog() {
  deleteDialog.value?.close()
  deleteTarget.value = null
  deleteConfirmation.value = ''
}

async function deleteUser() {
  const user = deleteTarget.value
  if (!user || !canDelete.value) return
  const deleted = await runUserAction(
    user,
    () => http.delete(`/api/admin/users/${user.id}`),
    '用户已删除',
    '账号已软删除，历史任务和审计记录得到保留。'
  )
  if (deleted) closeDeleteDialog()
}

onMounted(() => loadUsers({ page: 1 }))
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
      @close="closeAlert(alert.id)"
    />
  </div>

  <div class="p-5">
    <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 class="text-lg font-semibold">用户管理</h2>
        <p class="mt-1 text-xs opacity-60">创建账号、控制登录权限，并管理当前有效会话。</p>
      </div>
      <button class="btn btn-neutral btn-sm" @click="openCreateDialog">创建用户</button>
    </div>

    <div class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div class="stat rounded-box border border-base-300 bg-base-100 p-4">
        <div class="stat-title text-xs">用户总数</div><div class="stat-value text-2xl">{{ stats.total }}</div>
      </div>
      <div class="stat rounded-box border border-base-300 bg-base-100 p-4">
        <div class="stat-title text-xs">正常用户</div><div class="stat-value text-2xl text-success">{{ stats.active }}</div>
      </div>
      <div class="stat rounded-box border border-base-300 bg-base-100 p-4">
        <div class="stat-title text-xs">已禁用</div><div class="stat-value text-2xl text-error">{{ stats.disabled }}</div>
      </div>
      <div class="stat rounded-box border border-base-300 bg-base-100 p-4">
        <div class="stat-title text-xs">登录锁定</div><div class="stat-value text-2xl text-warning">{{ stats.locked }}</div>
      </div>
      <div class="stat col-span-2 rounded-box border border-base-300 bg-base-100 p-4 lg:col-span-1">
        <div class="stat-title text-xs">有效会话</div><div class="stat-value text-2xl">{{ stats.activeSessions }}</div>
      </div>
    </div>

    <section class="card border border-base-300 bg-base-100 p-4">
      <form class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,1fr)_160px_160px_auto]" @submit.prevent="applyFilters">
        <input v-model="filters.query" class="input input-bordered w-full" placeholder="搜索用户名或邮箱" />
        <select v-model="filters.role" class="select select-bordered w-full">
          <option value="">全部角色</option><option value="1">管理员</option><option value="2">普通用户</option>
        </select>
        <select v-model="filters.status" class="select select-bordered w-full">
          <option value="all">未删除用户</option><option value="active">正常</option><option value="disabled">已禁用</option><option value="locked">登录锁定</option><option value="deleted">已删除</option>
        </select>
        <div class="flex gap-2">
          <button class="btn btn-neutral grow" type="submit" :disabled="loading">查询</button>
          <button class="btn btn-ghost" type="button" :disabled="loading" @click="clearFilters">重置</button>
        </div>
      </form>

      <div v-if="loading && !hasUsers" class="grid min-h-72 place-items-center"><span class="loading loading-spinner loading-md"></span></div>
      <EmptyState v-else-if="initialLoadFailed" type="error" title="用户列表加载失败" message="无法从服务器读取用户信息，请稍后重试。" />
      <EmptyState v-else-if="!hasUsers" title="没有符合条件的用户" message="请调整筛选条件，或创建一个新用户。" />

      <div v-else class="overflow-x-auto">
        <table class="table table-zebra">
          <thead><tr><th>用户</th><th>角色</th><th>状态</th><th>会话</th><th>最近登录</th><th>创建时间</th><th class="text-right">操作</th></tr></thead>
          <tbody>
            <tr v-for="managedUser in users" :key="managedUser.id">
              <td>
                <div class="font-medium">{{ managedUser.username }} <span v-if="managedUser.isSelf" class="badge badge-outline badge-xs">当前账号</span></div>
                <div class="mt-1 max-w-52 truncate text-xs opacity-60">{{ managedUser.email || '未设置邮箱' }}</div>
              </td>
              <td><span class="badge badge-outline">{{ managedUser.role === 1 ? '管理员' : '普通用户' }}</span></td>
              <td><span class="badge" :class="statusInfo(managedUser.status).class">{{ statusInfo(managedUser.status).label }}</span><div v-if="managedUser.enable2fa" class="mt-1 text-xs opacity-60">已启用 2FA</div></td>
              <td><span class="font-medium">{{ managedUser.activeSessionCount }}</span><span class="ml-1 text-xs opacity-60">个有效会话</span></td>
              <td><div>{{ formatTime(managedUser.lastLoginAt) }}</div><div class="mt-1 text-xs opacity-60">{{ managedUser.lastLoginIp || '--' }}</div></td>
              <td>{{ formatTime(managedUser.createTime) }}</td>
              <td class="text-right">
                <div v-if="managedUser.status !== 'deleted'" class="flex flex-wrap justify-end gap-1">
                  <button class="btn btn-ghost btn-xs" :disabled="managedUser.isSelf || actionUserId !== null || managedUser.activeSessionCount === 0" @click="kickUser(managedUser)">踢出</button>
                  <button class="btn btn-outline btn-xs" :class="managedUser.status === 'disabled' ? 'btn-success' : 'btn-warning'" :disabled="managedUser.isSelf || actionUserId !== null" @click="toggleUser(managedUser)">{{ managedUser.status === 'disabled' ? '启用' : '禁用' }}</button>
                  <button class="btn btn-error btn-outline btn-xs" :disabled="managedUser.isSelf || actionUserId !== null" @click="openDeleteDialog(managedUser)">删除</button>
                </div>
                <span v-else class="text-xs opacity-50">无可用操作</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="hasUsers" class="mt-4 flex flex-col gap-2 border-t border-base-300 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <span class="text-xs opacity-60">共 {{ pagination.total }} 条，第 {{ pagination.page }} / {{ pagination.totalPages }} 页</span>
        <div class="join">
          <button class="btn btn-sm join-item" :disabled="pagination.page <= 1 || loading" @click="loadUsers({ page: pagination.page - 1 })">上一页</button>
          <button class="btn btn-sm join-item" :disabled="pagination.page >= pagination.totalPages || loading" @click="loadUsers({ page: pagination.page + 1 })">下一页</button>
        </div>
      </div>
    </section>
  </div>

  <dialog ref="createDialog" class="modal" @close="createForm = emptyCreateForm()">
    <form class="modal-box w-[calc(100vw-2rem)] max-w-lg" @submit.prevent="createUser">
      <h3 class="text-lg font-semibold">创建用户</h3>
      <p class="mt-1 text-xs opacity-60">用户名删除后不能复用；密码只在创建时提交，不会返回前端。</p>
      <div class="mt-5 grid gap-4">
        <label class="form-control"><span class="label-text mb-1">用户名</span><input v-model="createForm.username" class="input input-bordered" maxlength="64" autocomplete="off" required /></label>
        <label class="form-control"><span class="label-text mb-1">邮箱</span><input v-model="createForm.email" type="email" class="input input-bordered" maxlength="320" placeholder="可选" /></label>
        <label class="form-control"><span class="label-text mb-1">初始密码</span><div class="join w-full"><input v-model="createForm.password" :type="showPassword ? 'text' : 'password'" class="input input-bordered join-item grow" minlength="12" maxlength="256" autocomplete="new-password" required /><button type="button" class="btn join-item" @click="showPassword = !showPassword">{{ showPassword ? '隐藏' : '显示' }}</button></div><span class="label-text-alt mt-1 opacity-60">12-256 个字符</span></label>
        <label class="form-control"><span class="label-text mb-1">角色</span><select v-model.number="createForm.role" class="select select-bordered"><option :value="2">普通用户</option><option :value="1">管理员</option></select></label>
      </div>
      <div class="modal-action"><button type="button" class="btn" :disabled="creating" @click="closeCreateDialog">取消</button><button type="submit" class="btn btn-neutral" :disabled="creating"><span v-if="creating" class="loading loading-spinner loading-xs"></span>创建</button></div>
    </form>
    <form method="dialog" class="modal-backdrop"><button :disabled="creating">关闭</button></form>
  </dialog>

  <dialog ref="deleteDialog" class="modal" @close="deleteTarget = null; deleteConfirmation = ''">
    <div v-if="deleteTarget" class="modal-box w-[calc(100vw-2rem)] max-w-md">
      <h3 class="text-lg font-semibold text-error">删除用户</h3>
      <p class="mt-3 text-sm">账号将被软删除并立即失去所有会话，历史任务和审计记录会保留。</p>
      <p class="mt-3 text-sm">请输入用户名 <strong>{{ deleteTarget.username }}</strong> 确认：</p>
      <input v-model="deleteConfirmation" class="input input-bordered mt-2 w-full" autocomplete="off" />
      <div class="modal-action"><button class="btn" :disabled="actionUserId !== null" @click="closeDeleteDialog">取消</button><button class="btn btn-error" :disabled="!canDelete || actionUserId !== null" @click="deleteUser"><span v-if="actionUserId === deleteTarget.id" class="loading loading-spinner loading-xs"></span>确认删除</button></div>
    </div>
    <form method="dialog" class="modal-backdrop"><button :disabled="actionUserId !== null">关闭</button></form>
  </dialog>
</template>
