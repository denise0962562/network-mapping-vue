<script setup>
import { computed, ref } from 'vue'
import VueQrcode from 'vue-qrcode'

const twoFactorEnabled = ref(true)
const twoFactorBound = ref(false)
const copied = ref(false)
const twoFactorQrContent = 'otpauth://totp/NetworkMapping:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=NetworkMapping'

const twoFactorStatus = computed(() => {
  if (!twoFactorEnabled.value) return '关闭'
  return twoFactorBound.value ? '已绑定' : '未绑定'
})

const showTwoFactorBinding = computed(() => twoFactorEnabled.value && !twoFactorBound.value)

async function copyTwoFactorContent() {
  try {
    await navigator.clipboard.writeText(twoFactorQrContent)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = twoFactorQrContent
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
</script>

<template>
  <div class="p-5">
    <div class="mb-5">
      <h2 class="text-lg font-semibold">用户安全</h2>
      <p class="mt-1 text-xs opacity-60">管理当前用户的登录保护、双因素认证和安全验证状态。</p>
    </div>

    <div class="card bg-base-100 card-border border-base-300 p-4">
      <div class="mb-4">
        <h3 class="font-semibold">2FA 设置</h3>
        <p class="mt-1 text-xs opacity-60">启用后，登录时需要额外的身份验证步骤。</p>
      </div>

      <div class="divide-y divide-base-300">
        <div class="flex items-center justify-between gap-4 py-3">
          <div>
            <div class="text-sm font-medium">启用 2FA</div>
            <div class="text-xs opacity-60">控制用户双因素认证相关设置的总开关。</div>
          </div>
          <input v-model="twoFactorEnabled" type="checkbox" checked="checked" class="toggle" />
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
</template>
