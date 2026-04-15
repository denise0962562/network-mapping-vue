<script setup>
import { computed, ref } from 'vue'

const scannerForm = ref({
  name: '',
  region: '',
  networkType: 'ipv4'
})

const scannerList = ref([
  {
    index: 1,
    name: 'scanner-01',
    region: '华东-上海',
    ip: '10.12.4.21',
    status: '在线',
    creator: 'admin',
    createdAt: '2026-04-15T08:20:10+08:00',
    networkType: 'ipv4',
    totalTasks: 143
  },
  {
    index: 2,
    name: 'scanner-02',
    region: '华南-深圳',
    ip: '172.16.33.8',
    status: '在线',
    creator: 'secops',
    createdAt: '2026-04-15T08:35:22+08:00',
    networkType: 'all',
    totalTasks: 98
  },
  {
    index: 3,
    name: 'scanner-03',
    region: '亚太-香港',
    ip: 'fe80::2f3b:91ff:fe8a:101',
    status: '离线',
    creator: 'admin',
    createdAt: '2026-04-15T09:01:43+08:00',
    networkType: 'ipv6',
    totalTasks: 26
  }
])

const pageSize = ref(7)
const currentPage = ref(1)

const totalPages = computed(() => {
  const pages = Math.ceil(scannerList.value.length / pageSize.value)
  return pages > 0 ? pages : 1
})

const pagedScannerList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return scannerList.value.slice(start, end)
})

const pageNumbers = computed(() => Array.from({ length: totalPages.value }, (_, i) => i + 1))

function createScanner() {
  if (!scannerForm.value.name.trim()) return
  const nextIndex = scannerList.value.length + 1
  scannerList.value.push({
    index: nextIndex,
    name: scannerForm.value.name.trim(),
    region: scannerForm.value.region.trim() || '-',
    status: '在线',
    creator: 'current-user',
    createdAt: new Date().toISOString(),
    ip: '0.0.0.0',
    networkType: scannerForm.value.networkType,
    totalTasks: 0
  })
  scannerForm.value.name = ''
  scannerForm.value.region = ''
  scannerForm.value.networkType = 'ipv4'
  currentPage.value = totalPages.value
}

function changePage(page) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
}
</script>

<template>
  <div class="p-5">
    <div class="mb-4">
      <h2 class="text-lg font-semibold">扫描器</h2>
      <p class="text-xs opacity-60">该页面展示了添加的所有扫描器</p>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
      <div class="xl:col-span-2 flex flex-col gap-4">
        <div class="stats shadow border border-base-300 bg-base-100">
          <div class="stat place-items-center">
            <div class="stat-title">扫描器总数</div>
            <div class="stat-value">3</div>
            <div class="stat-desc">当前已注册扫描器</div>
          </div>

          <div class="stat place-items-center">
            <div class="stat-title">在线扫描器</div>
            <div class="stat-value">2</div>
            <div class="stat-desc">可立即执行任务</div>
          </div>

          <div class="stat place-items-center">
            <div class="stat-title">离线扫描器</div>
            <div class="stat-value text-error">1</div>
            <div class="stat-desc text-error">请检查节点状态</div>
          </div>
        </div>

        <div class="card bg-base-100 card-border border-base-300 p-4">
          <h3 class="font-semibold mb-3">扫描器列表</h3>
          <div class="overflow-x-auto rounded-box border border-base-300">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th></th>
                  <th>名称</th>
                  <th>区域</th>
                  <th>地址</th>
                  <th>状态</th>
                  <th>添加者</th>
                  <th>添加时间</th>
                  <th>网络环境</th>
                  <th>总任务数</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in pagedScannerList" :key="`${item.index}-${item.name}`">
                  <td>{{ item.index }}</td>
                  <td>{{ item.name }}</td>
                  <td>{{ item.region }}</td>
                  <td>{{ item.ip }}</td>
                  <td>{{ item.status }}</td>
                  <td>{{ item.creator }}</td>
                  <td>{{ item.createdAt }}</td>
                  <td>{{ item.networkType }}</td>
                  <td>{{ item.totalTasks }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="flex items-center justify-between mt-3">
            <div class="text-xs opacity-70">第 {{ currentPage }} / {{ totalPages }} 页</div>
            <div class="join">
              <button class="join-item btn btn-xs" :disabled="currentPage === 1" @click="changePage(currentPage - 1)">上一页</button>
              <button
                v-for="p in pageNumbers"
                :key="p"
                class="join-item btn btn-xs"
                :class="{ 'btn-active': p === currentPage }"
                @click="changePage(p)"
              >
                {{ p }}
              </button>
              <button class="join-item btn btn-xs" :disabled="currentPage === totalPages" @click="changePage(currentPage + 1)">下一页</button>
            </div>
          </div>
        </div>
      </div>

      <div class="xl:col-span-1">
        <div class="card bg-base-100 card-border border-base-300 p-4">
          <h3 class="font-semibold mb-3">创建扫描器</h3>

          <div class="grid grid-cols-1 gap-3">
            <label class="form-control w-full">
              <span class="label-text mb-1">扫描器名称</span>
              <input v-model="scannerForm.name" type="text" class="input input-bordered w-full" placeholder="例如：scanner-04" />
            </label>

            <label class="form-control w-full">
              <span class="label-text mb-1">区域</span>
              <input v-model="scannerForm.region" type="text" class="input input-bordered w-full" placeholder="例如：华东-上海" />
            </label>

            <label class="form-control w-full">
              <span class="label-text mb-1">扫描器网络类型</span>
              <select v-model="scannerForm.networkType" class="select select-bordered w-full">
                <option value="ipv4">IPV4</option>
                <option value="ipv6">IPV6</option>
                <option value="all">ALL</option>
              </select>
            </label>

            <button class="btn btn-neutral w-full mt-1" @click="createScanner">提交</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
