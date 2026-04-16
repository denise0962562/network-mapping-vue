<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const scannerId = computed(() => String(route.params.id || ''))

const scannerRecord = {
  '550e8400-e29b-41d4-a716-446655440001': {
    name: 'scanner-01',
    region: '华东-上海',
    ip: '10.12.4.21',
    networkType: 'IPV4',
    status: '在线',
    creator: 'admin',
    createdAt: '2026-04-16T09:12:21+08:00'
  },
  '550e8400-e29b-41d4-a716-446655440002': {
    name: 'scanner-02',
    region: '华南-深圳',
    ip: '172.16.33.8',
    networkType: 'ALL',
    status: '在线',
    creator: 'secops',
    createdAt: '2026-04-16T09:18:09+08:00'
  },
  '550e8400-e29b-41d4-a716-446655440003': {
    name: 'scanner-03',
    region: '',
    ip: 'fe80::2f3b:91ff:fe8a:101',
    networkType: 'IPV6',
    status: '离线',
    creator: 'admin',
    createdAt: '2026-04-16T09:20:45+08:00'
  }
}

const scannerDetail = computed(() => {
  return (
    scannerRecord[scannerId.value] || {
      name: 'unknown-scanner',
      region: '',
      ip: '0.0.0.0',
      networkType: 'ALL',
      status: '未知',
      creator: 'unknown',
      createdAt: '2026-04-16T00:00:00+08:00'
    }
  )
})

const hardwareInfo = computed(() => ({
  cpuName: 'Intel Xeon Gold 6348',
  cores: '32',
  ram: '128 GB',
  totalDisk: '2 TB'
}))
</script>

<template>
  <div class="p-5">
    <div class="mb-4">
      <h2 class="text-lg font-semibold">名称：{{ scannerDetail.name }}</h2>
      <p class="text-sm opacity-80 mt-1">ID：{{ scannerId }}</p>
      <p class="text-sm opacity-80 mt-1">区域：{{ scannerDetail.region || '无' }}</p>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
      <div class="xl:col-span-2">
        <div class="card bg-base-100 card-border border-base-300 p-4">
          <h3 class="font-semibold mb-3">扫描器详情</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">名称：</span>{{ scannerDetail.name }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">ID：</span>{{ scannerId }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">区域：</span>{{ scannerDetail.region || '无' }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">IP：</span>{{ scannerDetail.ip }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">网络环境：</span>{{ scannerDetail.networkType }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">状态：</span>{{ scannerDetail.status }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">创建者：</span>{{ scannerDetail.creator }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">添加时间：</span>{{ scannerDetail.createdAt }}</div>
          </div>
        </div>
      </div>

      <div class="xl:col-span-1">
        <div class="card bg-base-100 card-border border-base-300 p-4">
          <h3 class="font-semibold mb-3">硬件配置</h3>
          <div class="grid grid-cols-1 gap-3 text-sm">
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">CPU 名称：</span>{{ hardwareInfo.cpuName }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">核心数：</span>{{ hardwareInfo.cores }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">RAM 大小：</span>{{ hardwareInfo.ram }}</div>
            <div class="rounded-lg bg-base-200/60 p-3"><span class="opacity-70">总磁盘大小：</span>{{ hardwareInfo.totalDisk }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
