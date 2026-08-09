<script setup>
import { computed, ref } from 'vue'
import AppAlert from '@/components/AppAlert.vue'
import http from '@/utils/http'

const scannerForm = ref({
  name: '',
  location: '',
  remark: '',
  tag: ''
})

const submitting = ref(false)
const scannerResult = ref(null)
const alerts = ref([])

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

const scannerList = ref([
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
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
    id: '550e8400-e29b-41d4-a716-446655440002',
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
    id: '550e8400-e29b-41d4-a716-446655440003',
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
const copiedField = ref(null)

async function copyToClipboard(text, field) {
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
  copiedField.value = field
  window.setTimeout(() => {
    copiedField.value = null
  }, 1600)
}
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

async function createScanner() {
  if (!scannerForm.value.name.trim()) return
  if (submitting.value) return

  submitting.value = true
  scannerResult.value = null

  try {
    const payload = {
      name: scannerForm.value.name.trim(),
    }
    if (scannerForm.value.location.trim()) payload.location = scannerForm.value.location.trim()
    if (scannerForm.value.remark.trim()) payload.remark = scannerForm.value.remark.trim()
    if (scannerForm.value.tag.trim()) payload.tag = scannerForm.value.tag.trim()

    const response = await http.post('/api/scanner/add', payload)
    const result = response.data?.data
    if (response.data?.success === true && result?.scanner_id && result?.registration_token) {
      scannerResult.value = result
      scannerForm.value = {
        name: '',
        location: '',
        remark: '',
        tag: ''
      }
      pushAlert('success', '扫描器创建成功', '请妥善保存下方展示的 token，关闭后无法再次查看。')
    } else {
      pushAlert('error', '创建扫描器失败', '服务器未返回有效数据，请稍后重试。')
    }
  } catch (error) {
    console.error('create scanner failed', error)
    pushAlert('error', '创建扫描器失败', '请检查网络连接后重试。')
  } finally {
    submitting.value = false
  }
}

function changePage(page) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
}
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
                <tr v-for="item in pagedScannerList" :key="item.id">
                  <td>{{ item.index }}</td>
                  <td>
                    <router-link class="link" :to="`/scanner/${item.id}`">
                      {{ item.name }}
                    </router-link>
                  </td>
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
              <span class="label-text mb-1">扫描器名称 <span class="text-error">*</span></span>
              <input v-model="scannerForm.name" type="text" class="input input-bordered w-full" placeholder="例如：scanner-04" :disabled="submitting" />
            </label>

            <label class="form-control w-full">
              <span class="label-text mb-1">位置</span>
              <input v-model="scannerForm.location" type="text" class="input input-bordered w-full" placeholder="例如：华东-上海" :disabled="submitting" />
            </label>

            <label class="form-control w-full">
              <span class="label-text mb-1">备注</span>
              <input v-model="scannerForm.remark" type="text" class="input input-bordered w-full" placeholder="备注信息（可选）" :disabled="submitting" />
            </label>

            <label class="form-control w-full">
              <span class="label-text mb-1">标签</span>
              <input v-model="scannerForm.tag" type="text" class="input input-bordered w-full" placeholder="标签（可选）" :disabled="submitting" />
            </label>

            <button class="btn btn-neutral w-full mt-1" :disabled="submitting || !scannerForm.name.trim()" @click="createScanner">
              {{ submitting ? '提交中...' : '提交' }}
            </button>
          </div>

          <!-- 创建结果展开 -->
          <div v-if="scannerResult" class="mt-5 space-y-2 border-t border-base-300 pt-4">
            <h4 class="text-sm font-semibold">创建成功</h4>
            <p class="text-xs opacity-60">以下信息仅在本次展示，请立即保存。</p>

            <label class="form-control w-full">
              <span class="label-text text-xs mb-1">Scanner ID</span>
              <div class="flex items-center gap-2">
                <code class="flex-1 truncate rounded-lg bg-base-200 px-3 py-2 text-xs">{{ scannerResult.scanner_id }}</code>
                <button class="btn btn-ghost btn-xs shrink-0" @click="copyToClipboard(scannerResult.scanner_id, 'id')">
                  {{ copiedField === 'id' ? '已复制' : '复制' }}
                </button>
              </div>
            </label>

            <label class="form-control w-full">
              <span class="label-text text-xs mb-1">Registration Token</span>
              <div class="flex items-center gap-2">
                <code class="flex-1 truncate rounded-lg bg-base-200 px-3 py-2 text-xs">{{ scannerResult.registration_token }}</code>
                <button class="btn btn-ghost btn-xs shrink-0" @click="copyToClipboard(scannerResult.registration_token, 'token')">
                  {{ copiedField === 'token' ? '已复制' : '复制' }}
                </button>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
