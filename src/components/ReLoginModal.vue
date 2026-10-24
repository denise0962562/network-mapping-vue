<script setup>
import { tr } from '../i18n/index.js'

import { nextTick, ref } from 'vue'

const dialogRef = ref(null)

function open() {
  nextTick(() => {
    dialogRef.value?.showModal()
  })
}

function close() {
  dialogRef.value?.close()
}

function goToLogin() {
  close()
  window.location.href = '/login'
}

defineExpose({ open, close })
</script>

<template>
  <dialog ref="dialogRef" class="modal">
    <div class="modal-box w-[calc(100vw-2rem)] max-w-sm sm:max-w-md">
      <h3 class="text-lg font-bold">{{ tr("会话已过期") }}</h3>
      <p class="py-4 text-sm opacity-70"> {{ tr("您的登录状态已失效，请重新登录以继续使用。") }} </p>
      <div class="modal-action">
        <button class="btn btn-neutral" @click="goToLogin">{{ tr("重新登录") }}</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button @click="close">close</button>
    </form>
  </dialog>
</template>
