<script setup>
import { computed, onMounted, ref } from 'vue'
import VueQrcode from 'vue-qrcode'
import AppAlert from '@/components/AppAlert.vue'
import http from '@/utils/http'
import { expireCookie } from '@/utils/csrf'

const isLoading = ref(true)
const twoFactorEnabled = ref(false)
const twoFactorBound = ref(false)
const twoFactorQrContent = ref('')
const copied = ref(false)
const alerts = ref([])
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordSaving = ref(false)
const passwordDialogRef = ref(null)

const twoFactorStatus = computed(() => {
  if (!twoFactorEnabled.value) return '关闭'
  return twoFactorBound.value ? '已绑定' : '未绑定'
})

const showTwoFactorBinding = computed(() => twoFactorEnabled.value && !twoFactorBound.value)

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
  alerts.value = alerts.value.filter((a) => a.id !== id)
}

function openPasswordDialog() {
  passwordDialogRef.value?.showModal()
}

function resetPasswordForm() {
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
}

function closePasswordDialog() {
  if (!passwordSaving.value) passwordDialogRef.value?.close()
}

async function changePassword() {
  if (passwordSaving.value) return
  if (!currentPassword.value) {
    pushAlert('error', '无法修改密码', '请输入当前密码。')
    return
  }
  if (newPassword.value.length < 12 || newPassword.value.length > 128) {
    pushAlert('error', '无法修改密码', '新密码长度必须在 12 到 128 个字符之间。')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    pushAlert('error', '无法修改密码', '两次输入的新密码不一致。')
    return
  }
  if (currentPassword.value === newPassword.value) {
    pushAlert('error', '无法修改密码', '新密码不能与当前密码相同。')
    return
  }

  passwordSaving.value = true
  try {
    const response = await http.post('/api/user/password/update', {
      current_password: currentPassword.value,
      new_password: newPassword.value,
    }, {
      validateStatus: () => true,
    })
    if (response.status === 200 && response.data?.success === true) {
      currentPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
      expireCookie('csrf_token')
      pushAlert('success', '密码已修改', '登录会话已失效，即将跳转至登录页。', 3000)
      window.setTimeout(() => {
        window.location.href = '/login'
      }, 1000)
    } else {
      pushAlert('error', '密码修改失败', response.data?.message || '请检查当前密码后重试。')
    }
  } catch (error) {
    console.error('change password failed', error)
    pushAlert('error', '密码修改请求失败', '请检查网络连接后重试。')
  } finally {
    passwordSaving.value = false
  }
}

async function fetchTotpStatus() {
  try {
    const response = await http.get('/api/totp/get')
    if (response.data?.success === true) {
      twoFactorBound.value = true
      twoFactorEnabled.value = true
    }
  } catch (error) {
    console.error('fetch TOTP status failed', error)
    pushAlert('error', '2FA 状态获取失败', '请稍后刷新页面重试。')
  } finally {
    isLoading.value = false
  }
}

async function onToggleTwoFactor(event) {
  const checked = event.target.checked

  if (!checked) {
    const username = localStorage.getItem('username') || ''
    try {
      const response = await http.post('/api/totp/unbind', { username }, {
        validateStatus: () => true,
      })

      if (response.status === 200) {
        twoFactorEnabled.value = false
        twoFactorBound.value = false
        twoFactorQrContent.value = ''
        pushAlert('success', '2FA 已关闭', '双因素认证已成功解绑。')
      } else if (response.status === 404) {
        twoFactorEnabled.value = true
        pushAlert('error', '解绑失败', '未找到对应用户，请稍后重试。')
      } else if (response.status === 403) {
        twoFactorEnabled.value = true
        pushAlert('error', '解绑失败', '权限不足，无法执行此操作。')
      } else {
        twoFactorEnabled.value = true
        pushAlert('error', '解绑失败', '服务器错误，请稍后重试。')
      }
    } catch (error) {
      console.error('unbind TOTP failed', error)
      twoFactorEnabled.value = true
      pushAlert('error', '2FA 解绑请求失败', '请检查网络连接后重试。')
    }
    return
  }

  // 开启 2FA：请求绑定链接
  try {
    const response = await http.get('/api/totp/bind')
    if (response.data?.success === true && response.data?.data) {
      twoFactorEnabled.value = true
      twoFactorQrContent.value = response.data.data
    } else {
      twoFactorEnabled.value = false
      pushAlert('error', '2FA 绑定初始化失败', '服务器未能返回绑定信息，请稍后重试。')
    }
  } catch (error) {
    console.error('bind TOTP failed', error)
    twoFactorEnabled.value = false
    pushAlert('error', '2FA 绑定请求失败', '请检查网络连接后重试。')
  }
}

async function copyTwoFactorContent() {
  const text = twoFactorQrContent.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1600)
}

onMounted(() => {
  fetchTotpStatus()
})
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
    <div class="mb-5">
      <h2 class="text-lg font-semibold">用户安全</h2>
      <p class="mt-1 text-xs opacity-60">管理当前用户的登录保护、双因素认证和安全验证状态。</p>
    </div>

    <div class="card bg-base-100 card-border border-base-300 mb-5 p-4">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 class="font-semibold">修改密码</h3>
          <p class="mt-1 text-xs opacity-60">修改成功后，当前账户的所有登录会话都会失效，需要重新登录。</p>
        </div>
        <button type="button" class="btn btn-neutral btn-sm" @click="openPasswordDialog">修改密码</button>
      </div>
    </div>
    <div class="card bg-base-100 card-border border-base-300 p-4">
      <div class="mb-4">
        <h3 class="font-semibold">2FA 设置</h3>
        <p class="mt-1 text-xs opacity-60">启用后，登录时需要额外的身份验证步骤。</p>
      </div>

      <div v-if="isLoading" class="skeleton h-40 w-full rounded-box"></div>

      <div v-else class="divide-y divide-base-300">
        <div class="flex items-center justify-between gap-4 py-3">
          <div>
            <div class="text-sm font-medium">启用 2FA</div>
            <div class="text-xs opacity-60">控制用户双因素认证相关设置的总开关。</div>
          </div>
          <input type="checkbox" class="toggle" :checked="twoFactorEnabled" @change="onToggleTwoFactor" />
        </div>

        <div class="flex items-center justify-between gap-4 py-3">
          <div>
            <div class="text-sm font-medium">2FA 绑定状态</div>
            <div class="text-xs opacity-60">显示当前用户是否已经绑定双因素认证设备。</div>
          </div>
          <span class="badge" :class="twoFactorEnabled && twoFactorBound ? 'badge-success' : 'badge-ghost'">
            {{ twoFactorStatus }}
          </span>
        </div>

        <div v-if="showTwoFactorBinding" class="flex w-full flex-col items-center justify-center py-4 lg:flex-row lg:gap-4">
          <div class="grid shrink-0 place-items-center">
            <div class="rounded-lg border border-base-300 bg-white p-3">
              <vue-qrcode
                :value="twoFactorQrContent"
                :width="160"
                :margin="1"
                type="image/png"
                :color="{ dark: '#000000ff', light: '#ffffffff' }"
              />
            </div>
          </div>

          <div class="divider my-2 lg:divider-horizontal lg:mx-0">OR</div>

          <div class="grid w-full max-w-md place-items-center lg:w-auto">
            <div class="w-full min-w-0">
              <div class="text-sm font-medium">扫码绑定 2FA</div>
              <p class="mt-1 text-xs opacity-60">使用认证器应用扫描左侧二维码，或复制下方测试内容手动添加。</p>

              <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code class="block min-w-0 flex-1 overflow-hidden text-ellipsis rounded-lg bg-base-200 px-3 py-2 text-xs">
                  {{ twoFactorQrContent }}
                </code>
                <button type="button" class="btn btn-neutral btn-sm rounded-lg" @click="copyTwoFactorContent">
                  {{ copied ? '已复制' : '复制' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <dialog ref="passwordDialogRef" class="modal" @close="resetPasswordForm">
    <form class="modal-box w-[calc(100vw-2rem)] max-w-md" @submit.prevent="changePassword">
      <h3 class="text-lg font-bold">修改密码</h3>
      <p class="py-3 text-sm opacity-70">修改成功后，当前账户的所有登录会话都会失效，需要重新登录。</p>

      <div class="space-y-4">
        <label class="form-control">
          <span class="label-text mb-1 text-sm">当前密码</span>
          <input v-model="currentPassword" type="password" autocomplete="current-password" class="input input-bordered w-full" required />
        </label>
        <label class="form-control">
          <span class="label-text mb-1 text-sm">新密码</span>
          <input v-model="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" class="input input-bordered w-full" required />
        </label>
        <label class="form-control">
          <span class="label-text mb-1 text-sm">确认新密码</span>
          <input v-model="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" class="input input-bordered w-full" required />
        </label>
      </div>

      <p class="mt-3 text-xs opacity-60">新密码长度为 12 至 128 个字符。</p>
      <div class="modal-action">
        <button type="button" class="btn btn-ghost" :disabled="passwordSaving" @click="closePasswordDialog">取消</button>
        <button type="submit" class="btn btn-neutral" :disabled="passwordSaving">{{ passwordSaving ? '修改中...' : '确认修改' }}</button>
      </div>
    </form>
    <form method="dialog" class="modal-backdrop">
      <button :disabled="passwordSaving">关闭</button>
    </form>
  </dialog>
</template>
