<script setup>
import { ref } from 'vue'
import http from './utils/http'

const username = ref('')
const password = ref('')
const isLoggingIn = ref(false)

async function handleLogin() {
  if (isLoggingIn.value) return

  isLoggingIn.value = true
  try {
    const response = await http.post('/api/login', {
      username: username.value,
      password: password.value,
    })

    if (response.status === 200) {
      window.location.href = '/'
    }
  } catch (error) {
    // 非 200 或请求异常时，按需求暂不处理
  } finally {
    isLoggingIn.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-gray-200 font-sans">
    <div class="flex flex-grow items-center justify-center py-10">
      <div class="card card-lg w-96 overflow-hidden border-base-300 bg-base-100 card-border">
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
                v-model="username"
                type="text"
                required
                class="grow"
                placeholder="用户名"
                minlength="8"
                maxlength="30"
                pattern="[A-Za-z][A-Za-z0-9-]*"
              >
            </label>
            <p class="validator-hint hidden">用户名需要 8-30 位，且必须以字母开头</p>
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
                minlength="8"
                maxlength="30"
                pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}"
                @keyup.enter="handleLogin"
              >
            </label>
            <p class="validator-hint hidden">密码需要至少 8 位，且必须包含大小写字母和数字</p>
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
    </div>

    <footer class="footer footer-center bg-base-content p-4 text-base-content text-white sm:footer-horizontal">
      <aside>
        <p>Copyright © 2026 - All right reserved by Abdc.world</p>
      </aside>
    </footer>
  </div>
</template>
