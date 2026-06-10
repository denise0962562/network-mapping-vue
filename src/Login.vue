<script setup>
import { nextTick, onMounted, ref } from 'vue'
import AppAlert from './components/AppAlert.vue'
import http from './utils/http'
import { getCookieValue, expireCookie } from './utils/csrf'

const username = ref('')
const password = ref('')
const totpToken = ref('')
const totpInputRef = ref(null)
const isLoggingIn = ref(false)
const isVerifyingTotp = ref(false)
const isTotpRequired = ref(false)
const showLoginError = ref(false)
const loginErrorMessage = ref('登录失败')
const loginErrorId = ref(0)
const loginErrorTimeout = ref(5000)

function closeLoginError() {
  showLoginError.value = false
}

function openLoginError(message = '登录失败') {
  loginErrorMessage.value = message
  loginErrorId.value += 1
  showLoginError.value = true
}

function getCsrfHeaders() {
  const token = getCookieValue('csrf_token')
  return token ? { 'X-CSRF-Token': token } : {}
}

const usernameInputRef = ref(null)

onMounted(() => {
  if (getCookieValue('csrf_token')) {
    expireCookie('csrf_token')
  }
  nextTick(() => {
    usernameInputRef.value?.focus()
  })
})

function onCardEnter() {
  if (isTotpRequired.value) {
    nextTick(() => {
      totpInputRef.value?.focus()
    })
  }
}

async function handleLogin() {
  if (isLoggingIn.value) return

  isLoggingIn.value = true
  try {
    const response = await http.post(
      '/api/login',
      {
        username: username.value,
        password: password.value,
      },
      {
        validateStatus: () => true,
      }
    )

    if (response.status === 200) {
      localStorage.setItem('username', username.value)
      window.location.href = '/'
      return
    }

    if (response.status === 401 && response.data?.success === true) {
      isTotpRequired.value = true
      totpToken.value = ''
      closeLoginError()
      return
    }

    openLoginError()
  } catch (error) {
    openLoginError()
  } finally {
    isLoggingIn.value = false
  }
}

async function handleTotpVerify() {
  if (isVerifyingTotp.value) return

  isVerifyingTotp.value = true
  try {
    const response = await http.post(
      '/api/totp/verify',
      {
        username: username.value,
        token: totpToken.value,
      },
      {
        headers: getCsrfHeaders(),
        validateStatus: () => true,
      }
    )

    if (response.status === 200 && response.data?.success !== false) {
      localStorage.setItem('username', username.value)
      window.location.href = '/'
      return
    }

    openLoginError('验证码验证失败')
  } catch (error) {
    openLoginError('验证码验证失败')
  } finally {
    isVerifyingTotp.value = false
  }
}

function backToLogin() {
  isTotpRequired.value = false
  totpToken.value = ''
  closeLoginError()
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-gray-200 font-sans">
    <div class="fixed top-4 left-1/2 z-50 flex w-[calc(100vw-2rem)] -translate-x-1/2 justify-center sm:left-auto sm:right-4 sm:w-auto sm:translate-x-0 sm:justify-end">
      <transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 translate-y-[-8px]"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-[-8px]"
      >
        <AppAlert
          v-if="showLoginError"
          :key="loginErrorId"
          type="error"
          :title="loginErrorMessage"
          description="请检查账号信息后重试。"
          :timeout="loginErrorTimeout"
          @close="closeLoginError"
        />
      </transition>
    </div>

    <div class="flex grow items-center justify-center py-10">
      <transition
        mode="out-in"
        @after-enter="onCardEnter"
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="opacity-0 translate-y-3 scale-[0.98]"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="opacity-100 translate-y-0 scale-100"
        leave-to-class="opacity-0 -translate-y-2 scale-[0.98]"
      >
        <div v-if="!isTotpRequired" key="login-card" class="card card-lg w-96 overflow-hidden border-base-300 bg-base-100 card-border">
          <div class="border-b border-dashed border-base-300">
            <div class="flex items-center gap-2 p-4">
              <div class="grow">登录账号</div>
            </div>
          </div>

          <div class="card-body gap-4">
            <div class="flex flex-col gap-1">
              <label class="input validator input-border flex max-w-none items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="h-4 w-4 opacity-70">
                  <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z" />
                </svg>
                <input
                  ref="usernameInputRef"
                  v-model="username"
                  type="text"
                  required
                  class="grow"
                  placeholder="用户名"
                >
              </label>
            </div>

            <div class="flex flex-col gap-1">
              <label class="input validator input-border flex max-w-none items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="h-4 w-4 opacity-70">
                  <path
                    fill-rule="evenodd"
                    d="M14 6a4 4 0 0 1-4.899 3.899l-1.955 1.955a.5.5 0 0 1-.353.146H5v1.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2.293a.5.5 0 0 1 .146-.353l3.955-3.955A4 4 0 1 1 14 6Zm-4-2a.75.75 0 0 0 0 1.5.5.5 0 0 1 .5.5.75.75 0 0 0 1.5 0 2 2 0 0 0-2-2Z"
                    clip-rule="evenodd"
                  />
                </svg>
                <input
                  v-model="password"
                  type="password"
                  required
                  class="grow"
                  placeholder="密码"
                  @keyup.enter="handleLogin"
                >
              </label>
            </div>

            <div class="card-actions items-center gap-6">
              <button
                class="btn btn-neutral mt-1 w-full"
                :disabled="isLoggingIn"
                @click="handleLogin"
              >
                {{ isLoggingIn ? '登录中...' : '登录' }}
              </button>
            </div>
          </div>
        </div>

        <div v-else key="totp-card" class="card card-lg w-96 overflow-hidden border-base-300 bg-base-100 card-border">
          <div class="border-b border-dashed border-base-300">
            <div class="flex items-center gap-2 p-4">
              <button type="button" class="btn btn-ghost btn-xs" aria-label="返回登录" @click="backToLogin">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m12 19-7-7 7-7" />
                  <path d="M19 12H5" />
                </svg>
              </button>
              <div class="grow">两步验证</div>
            </div>
          </div>

          <div class="card-body gap-4">
            <div class="flex flex-col gap-1">
              <label class="input validator input-border flex max-w-none items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="h-4 w-4 opacity-70">
                  <path fill-rule="evenodd" d="M8 1a4 4 0 0 0-4 4v2a2 2 0 0 0-1 1.732V13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8.732A2 2 0 0 0 12 7V5a4 4 0 0 0-4-4Zm2.5 6V5a2.5 2.5 0 0 0-5 0v2h5Z" clip-rule="evenodd" />
                </svg>
                <input
                  ref="totpInputRef"
                  v-model="totpToken"
                  type="text"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  required
                  class="grow tracking-widest"
                  placeholder="2FA 验证码"
                  minlength="6"
                  maxlength="6"
                  pattern="[0-9]{6}"
                  @keyup.enter="handleTotpVerify"
                >
              </label>
              <p class="validator-hint hidden">请输入 6 位数字验证码</p>
            </div>

            <div class="card-actions items-center gap-2">
              <button
                class="btn btn-neutral mt-1 w-full"
                :disabled="isVerifyingTotp"
                @click="handleTotpVerify"
              >
                {{ isVerifyingTotp ? '验证中...' : '验证' }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <footer class="footer footer-center bg-base-content p-4 text-white sm:footer-horizontal">
      <aside>
        <p>Copyright © 2026 - All right reserved by Abdc.world</p>
      </aside>
    </footer>
  </div>
</template>
