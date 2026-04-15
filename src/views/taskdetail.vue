<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const taskId = computed(() => String(route.params.taskid || ''))
const displayTaskId = computed(() => {
  const id = taskId.value
  if (id.length <= 34) return id
  return `${id.slice(0, 18)}...${id.slice(-8)}`
})

const taskRemark = ref('对 DMZ 网段进行例行资产盘点与漏洞扫描，优先关注对外暴露服务。')
const taskMeta = ref({
  status: '扫描完成',
  priority: '立刻'
})

const summaryStats = ref([
  { title: '存活 IP 数', value: '128', desc: '' },
  { title: '存活端口数', value: '412', desc: '' },
  { title: '漏洞数', value: '17', desc: '高危 3 / 中危 6 / 低危 8' },
  { title: '扫描耗时', value: '18m 42s', desc: '总耗时' }
])

const taskDetail = ref({
  targetIp: '10.12.4.0/24, 172.16.33.8',
  port: '22,80,443,8080,3306',
  scanType: '全量资产发现 + 漏洞扫描',
  startTime: '2026-04-15T09:32:14+08:00',
  endTime: '2026-04-15T09:50:56+08:00',
  starter: 'admin',
  scanner: 'scanner-03'
})

const resultByIp = ref([
  { ip: '10.12.4.21', ports: ['22', '80', '443'], vulns: ['CVE-2024-6387', '弱口令风险'] },
  { ip: '10.12.4.57', ports: ['80', '8080'], vulns: ['目录遍历风险'] },
  { ip: '172.16.33.8', ports: ['3306'], vulns: ['未授权访问风险'] }
])

const timelineSteps = ref([
  { time: '2026-04-15T09:30:09+08:00', label: '创建扫描' },
  { time: '2026-04-15T09:32:14+08:00', label: '开始执行扫描' },
  { time: '2026-04-15T09:33:20+08:00', label: '开始存活端口扫描' },
  { time: '2026-04-15T09:36:41+08:00', label: '开始页面内容抓取（只抓取关键信息）' },
  { time: '2026-04-15T09:42:10+08:00', label: '开始漏洞扫描' },
  { time: '2026-04-15T09:50:56+08:00', label: '扫描结束' }
])

const activeStepIndex = ref(5)

const asnIspRows = ref([
  { index: 1, ipCidr: '10.12.4.0/24', name: 'ExampleNet', asnumber: 'AS45102', adminC: 'CN-OPS-01' },
  { index: 2, ipCidr: '172.16.33.8/32', name: 'MetroCloud', asnumber: 'AS58453', adminC: 'HK-NOC-22' },
  { index: 3, ipCidr: '43.132.11.22/32', name: 'GlobalTransit', asnumber: 'AS3257', adminC: 'SG-ADMIN-7' }
])

function isNodeActive(index) {
  return index <= activeStepIndex.value
}

function isPrevLineActive(index) {
  return index > 0 && index <= activeStepIndex.value
}

function isNextLineActive(index) {
  return index < timelineSteps.value.length - 1 && index < activeStepIndex.value
}

async function copyTaskId() {
  const text = taskId.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch (error) {
    const textArea = document.createElement('textarea')
    textArea.value = text
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
  }
}
</script>

<template>
  <div class="p-5">
    <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-2">
      <div class="min-w-0 flex items-center gap-2">
        <h2 class="text-lg font-semibold truncate text-left" :title="taskId">
          任务 UUID：{{ displayTaskId }}
        </h2>
        <div class="tooltip tooltip-bottom" :data-tip="taskId">
          <button class="btn btn-ghost btn-xs gap-1" @click="copyTaskId">
            UUID
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-files-icon lucide-files size-3.5"><path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/><path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z"/><path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1"/></svg>
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-start md:justify-end gap-2">
        <button class="btn btn-neutral btn-outline">重新打开</button>
        <button class="btn btn-neutral">导出</button>
        <button class="btn btn-outline btn-error">删除</button>
      </div>
    </div>

    <p class="text-sm opacity-70 mb-4 break-words">备注：{{ taskRemark }}</p>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
      <div class="xl:col-span-2 flex flex-col gap-5">
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div v-for="item in summaryStats" :key="item.title" class="stats shadow border border-base-300 bg-base-100">
            <div class="stat">
              <div class="stat-title">{{ item.title }}</div>
              <div class="stat-value text-2xl">{{ item.value }}</div>
              <div class="stat-desc">{{ item.desc }}</div>
            </div>
          </div>
        </div>

        <div class="card bg-base-100 card-border border-base-300 p-4">
          <h3 class="font-semibold mb-3">任务细节</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div class="rounded-lg bg-base-200/50 p-3"><span class="opacity-60">目标 IP：</span>{{ taskDetail.targetIp }}</div>
            <div class="rounded-lg bg-base-200/50 p-3"><span class="opacity-60">Port：</span>{{ taskDetail.port }}</div>
            <div class="rounded-lg bg-base-200/50 p-3"><span class="opacity-60">扫描类型：</span>{{ taskDetail.scanType }}</div>
            <div class="rounded-lg bg-base-200/50 p-3"><span class="opacity-60">扫描发起人：</span>{{ taskDetail.starter }}</div>
            <div class="rounded-lg bg-base-200/50 p-3"><span class="opacity-60">开始时间：</span>{{ taskDetail.startTime }}</div>
            <div class="rounded-lg bg-base-200/50 p-3"><span class="opacity-60">结束时间：</span>{{ taskDetail.endTime }}</div>
            <div class="rounded-lg bg-base-200/50 p-3 md:col-span-2"><span class="opacity-60">执行扫描器：</span>{{ taskDetail.scanner }}</div>
          </div>
        </div>

        <div class="card bg-base-100 card-border border-base-300 p-4">
          <h3 class="font-semibold mb-3">结果展示</h3>
          <div class="flex flex-col gap-2">
            <div v-for="row in resultByIp" :key="row.ip" class="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm">
              <div class="font-medium">{{ row.ip }}</div>
              <div class="opacity-70 mt-1">开放端口：{{ row.ports.join(', ') }}</div>
              <div class="opacity-70">漏洞：{{ row.vulns.length ? row.vulns.join('；') : '无' }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="xl:col-span-1 flex flex-col gap-5">
        <div class="card bg-base-100 card-border border-base-300 p-4">
          <h3 class="font-semibold mb-3">执行状态</h3>
          <div class="flex w-full flex-col text-sm">
            <div class="card bg-base-200 rounded-box px-3 py-2">扫描状态：{{ taskMeta.status }}</div>
            <div class="card bg-base-200 rounded-box px-3 py-2 mt-2">优先级：{{ taskMeta.priority }}</div>
          </div>

          <div class="divider my-3">Timeline</div>

          <div>
            <ul class="timeline timeline-vertical">
              <li v-for="(step, index) in timelineSteps" :key="step.label">
                <hr v-if="index > 0" :class="isPrevLineActive(index) ? 'bg-neutral' : ''" />
                <div class="timeline-start text-xs opacity-70">{{ step.time }}</div>
                <div class="timeline-middle">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    class="h-5 w-5"
                    :class="isNodeActive(index) ? 'text-neutral' : 'opacity-40'"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </div>
                <div class="timeline-end timeline-box text-sm">{{ step.label }}</div>
                <hr v-if="index < timelineSteps.length - 1" :class="isNextLineActive(index) ? 'bg-neutral' : ''" />
              </li>
            </ul>
          </div>
        </div>

        <div class="card bg-base-100 card-border border-base-300 p-4">
          <h3 class="font-semibold mb-3">ASN&ISP</h3>
          <div class="overflow-x-auto rounded-box border border-base-300">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th></th>
                  <th>IP/CIDR</th>
                  <th>Name</th>
                  <th>ASNumber</th>
                  <th>Admin-c</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in asnIspRows" :key="`${row.index}-${row.ipCidr}`">
                  <td>{{ row.index }}</td>
                  <td>{{ row.ipCidr }}</td>
                  <td>{{ row.name }}</td>
                  <td>{{ row.asnumber }}</td>
                  <td>{{ row.adminC }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
