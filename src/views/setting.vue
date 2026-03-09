<script setup>
import { computed, ref } from 'vue'

const listenConfig = ref({
  host: '0.0.0.0',
  port: '8080'
})

const mailConfig = ref({
  recipient: 'security-team@example.com',
  smtpHost: 'smtp.example.com',
  smtpPort: '465',
  sender: 'scanner@example.com',
  senderKey: ''
})

const savedListenConfig = ref({ ...listenConfig.value })
const savedMailConfig = ref({ ...mailConfig.value })
const showSenderKey = ref(false)

const showListenSave = computed(() => {
  return JSON.stringify(listenConfig.value) !== JSON.stringify(savedListenConfig.value)
})

const showMailSave = computed(() => {
  return JSON.stringify(mailConfig.value) !== JSON.stringify(savedMailConfig.value)
})

function saveListenConfig() {
  savedListenConfig.value = { ...listenConfig.value }
}

function saveMailConfig() {
  savedMailConfig.value = { ...mailConfig.value }
}
</script>

<template>
  <div class="flex justify-center">
    <div class="card bg-base-100 card-border m-2.5 border-base-300 w-[85%] p-5">
      <div class="mb-3">
        <h2 class="text-lg font-semibold">系统设置</h2>
        <p class="text-xs opacity-60">监听配置与通知方式</p>
      </div>

      <div class="card bg-base-100 card-border border-base-300 p-4 mb-4">
        <div class="flex items-start justify-between mb-3">
          <h3 class="font-semibold">当前监听主机和端口</h3>
          <button
            v-if="showListenSave"
            class="btn rounded-lg btn-primary btn-sm"
            @click="saveListenConfig"
          >
            保存
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label class="form-control w-full">
            <span class="label-text mb-1">监听主机</span>
            <input
              v-model="listenConfig.host"
              type="text"
              class="input input-bordered w-full"
              placeholder="例如: 0.0.0.0"
            />
          </label>

          <label class="form-control w-full">
            <span class="label-text mb-1">监听端口</span>
            <input
              v-model="listenConfig.port"
              type="number"
              class="input input-bordered w-full"
              placeholder="例如: 8080"
            />
          </label>
        </div>
      </div>

      <div class="card bg-base-100 card-border border-base-300 p-4">
        <div class="flex items-start justify-between mb-3">
          <h3 class="font-semibold">通知</h3>
          <button
            v-if="showMailSave"
            class="btn rounded-lg btn-primary btn-sm"
            @click="saveMailConfig"
          >
            保存
          </button>
        </div>

        <div class="flex flex-col gap-3">
          <details class="collapse bg-base-100 border border-base-300">
            <summary class="collapse-title font-semibold">邮件通知</summary>
            <div class="collapse-content text-sm">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <label class="form-control w-full md:col-span-2">
                  <span class="label-text mb-1">收件人</span>
                  <input
                    v-model="mailConfig.recipient"
                    type="email"
                    class="input input-bordered w-full"
                    placeholder="name@example.com"
                  />
                </label>

                <label class="form-control w-full">
                  <span class="label-text mb-1">邮件服务器</span>
                  <input
                    v-model="mailConfig.smtpHost"
                    type="text"
                    class="input input-bordered w-full"
                    placeholder="smtp.example.com"
                  />
                </label>

                <label class="form-control w-full">
                  <span class="label-text mb-1">服务器端口</span>
                  <input
                    v-model="mailConfig.smtpPort"
                    type="number"
                    class="input input-bordered w-full"
                    placeholder="465"
                  />
                </label>

                <label class="form-control w-full md:col-span-2">
                  <span class="label-text mb-1">发件人地址</span>
                  <input
                    v-model="mailConfig.sender"
                    type="email"
                    class="input input-bordered w-full"
                    placeholder="scanner@example.com"
                  />
                </label>

                <label class="form-control w-full md:col-span-2">
                  <span class="label-text mb-1">发件邮箱密钥</span>
                  <div class="relative">
                    <input
                      v-model="mailConfig.senderKey"
                      :type="showSenderKey ? 'text' : 'password'"
                      class="input input-bordered w-full pr-10"
                      placeholder="请输入发件邮箱密钥"
                    />
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm absolute right-1 top-1/2 -translate-y-1/2"
                      @click="showSenderKey = !showSenderKey"
                    >
                      <svg
                        v-if="!showSenderKey"
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class="lucide lucide-eye-icon lucide-eye"
                      >
                        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <svg
                        v-else
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class="lucide lucide-eye-off-icon lucide-eye-off"
                      >
                        <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                        <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                        <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                        <path d="m2 2 20 20" />
                      </svg>
                    </button>
                  </div>
                </label>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  </div>
</template>
