<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import EmptyState from '@/components/EmptyState.vue'
import http from '@/utils/http'

const route = useRoute()
const scannerId = computed(() => String(route.params.id || ''))

const scannerDetail = ref(null)
const isLoading = ref(false)
const loadFailed = ref(false)
const notFound = ref(false)

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatUptime(value) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0) return '-'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${days} 天 ${hours} 小时 ${minutes} 分钟`
}

const scannerStatus = computed(() => {
  const scanner = scannerDetail.value
  if (!scanner || scanner.is_enable !== true) return { text: '待注册', class: 'badge-warning' }
  if (scanner.is_run === true) return { text: '在线', class: 'badge-success' }
  if (scanner.is_run === false) return { text: '离线', class: 'badge-error' }
  return { text: '已注册', class: 'badge-info' }
})

async function loadScanner() {
  if (!scannerId.value) return
  isLoading.value = true
  loadFailed.value = false
  notFound.value = false
  scannerDetail.value = null

  try {
    const response = await http.get(`/api/scanner/${scannerId.value}`)
    if (response.data?.success !== true || !response.data?.data) {
      throw new Error('服务器未返回有效扫描器信息')
    }
    scannerDetail.value = response.data.data
  } catch (error) {
    console.error('load scanner detail failed', error)
    notFound.value = error?.response?.status === 404
    loadFailed.value = !notFound.value
  } finally {
    isLoading.value = false
  }
}

watch(scannerId, loadScanner, { immediate: true })
</script>

<template>
  <div class="p-5">
    <div class="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">{{ scannerDetail?.name || '扫描器详情' }}</h2>
        <p class="text-sm opacity-80 mt-1">ID：{{ scannerId }}</p>
        <p v-if="scannerDetail" class="text-sm opacity-80 mt-1">位置：{{ scannerDetail.location || '无' }}</p>
      </div>
      <router-link to="/scanner" class="btn btn-ghost btn-sm">返回列表</router-link>
    </div>

    <div v-if="isLoading" class="grid min-h-80 place-items-center rounded-lg bg-base-200/60">
      <span class="loading loading-spinner loading-md"></span>
    </div>

    <EmptyState
      v-else-if="notFound"
      type="error"
      title="扫描器不存在"
      message="该扫描器可能已被删除，或链接中的 ID 无效。"
    />

    <EmptyState
      v-else-if="loadFailed"
      type="error"
      title="扫描器详情加载失败"
      message="无法从服务器获取扫描器信息，请稍后重试。"
    />

    <div v-else-if="scannerDetail" class="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
      <div class="xl:col-span-2">
        <div class="card bg-base-100 card-border border-base-300 p-4">
          <h3 class="font-semibold mb-3">基本信息</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">名称：</span>{{ scannerDetail.name || '未命名扫描器' }}</div>
            <div class="rounded-lg bg-base-200/60 p-3 break-all"><span class="opacity-70">ID：</span>{{ scannerDetail.scanner_id }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">位置：</span>{{ scannerDetail.location || '-' }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">IP：</span>{{ scannerDetail.ip_address || '-' }}</div>
            <div class="rounded-lg bg-base-200/60 p-3">
              <span class="opacity-70">状态：</span>
              <span class="badge badge-sm" :class="scannerStatus.class">{{ scannerStatus.text }}</span>
            </div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">创建者：</span>{{ scannerDetail.creator || '-' }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">创建时间：</span>{{ formatDate(scannerDetail.create_time) }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">注册时间：</span>{{ formatDate(scannerDetail.register_time) }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">更新时间：</span>{{ formatDate(scannerDetail.update_time) }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">扫描器版本：</span>{{ scannerDetail.scanner_version || '-' }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">标签：</span>{{ scannerDetail.tag || '-' }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">备注：</span>{{ scannerDetail.remark || '-' }}</div>
          </div>
        </div>
      </div>

      <div class="xl:col-span-1">
        <div class="card bg-base-100 card-border border-base-300 p-4">
          <h3 class="font-semibold mb-3">运行环境</h3>
          <div class="grid grid-cols-1 gap-3 text-sm">
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">系统版本：</span>{{ scannerDetail.system_version || '-' }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">CPU 核心数：</span>{{ scannerDetail.cpus ?? '-' }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">RAM：</span>{{ scannerDetail.ram ?? '-' }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">运行时间：</span>{{ formatUptime(scannerDetail.uptime) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
