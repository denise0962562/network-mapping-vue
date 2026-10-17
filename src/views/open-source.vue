<script setup>
import { computed, onMounted, ref, useId } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import http from '@/utils/http'

const formFieldId = useId()
const projects = ref([])
const lastReviewed = ref('')
const isLoading = ref(false)
const loadError = ref('')
const searchText = ref('')
const selectedEcosystem = ref('all')
const selectedLicense = ref('all')

const ecosystemOptions = [
  { value: 'all', label: '全部组件' },
  { value: 'backend', label: '服务端' },
  { value: 'scanner', label: '扫描器' },
  { value: 'shared-rust', label: 'Rust 共用' },
  { value: 'frontend', label: '前端' }
]

const ecosystemLabels = Object.fromEntries(
  ecosystemOptions.filter((option) => option.value !== 'all').map((option) => [option.value, option.label])
)

const licenseOptions = computed(() => [
  'all',
  ...new Set(projects.value.map((project) => project.license).filter(Boolean).sort())
])

const filteredProjects = computed(() => {
  const keyword = searchText.value.trim().toLocaleLowerCase()
  return projects.value.filter((project) => {
    const matchesKeyword = !keyword || [project.name, project.package, project.usage, project.license]
      .some((value) => String(value || '').toLocaleLowerCase().includes(keyword))
    const matchesEcosystem = selectedEcosystem.value === 'all'
      || project.ecosystem === selectedEcosystem.value
    const matchesLicense = selectedLicense.value === 'all'
      || project.license === selectedLicense.value
    return matchesKeyword && matchesEcosystem && matchesLicense
  })
})

const summaryCards = computed(() => [
  { label: '项目总数', value: projects.value.length },
  {
    label: '服务端相关',
    value: projects.value.filter((project) => ['backend', 'shared-rust'].includes(project.ecosystem)).length
  },
  {
    label: '扫描器相关',
    value: projects.value.filter((project) => ['scanner', 'shared-rust'].includes(project.ecosystem)).length
  },
  { label: '前端相关', value: projects.value.filter((project) => project.ecosystem === 'frontend').length }
])

function resetFilters() {
  searchText.value = ''
  selectedEcosystem.value = 'all'
  selectedLicense.value = 'all'
}

async function fetchProjects() {
  if (isLoading.value) return
  isLoading.value = true
  loadError.value = ''

  try {
    const response = await http.get('/api/open-source/projects')
    const receivedProjects = response.data?.projects
    if (!Array.isArray(receivedProjects)) {
      throw new Error('invalid open-source project response')
    }
    projects.value = receivedProjects
    lastReviewed.value = response.data?.last_reviewed || ''
  } catch (error) {
    console.error('fetch open-source projects failed', error)
    loadError.value = '无法获取开源项目清单，请检查服务状态后重试。'
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchProjects)
</script>

<template>
  <div class="p-5">
    <div class="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 class="text-lg font-semibold">开源项目</h2>
        <p class="text-xs opacity-60">本系统直接使用的主要开源软件与许可证信息</p>
      </div>
      <p v-if="lastReviewed" class="text-xs opacity-60">清单复核日期：{{ lastReviewed }}</p>
    </div>

    <div v-if="isLoading && projects.length === 0" class="flex flex-col gap-4" aria-busy="true">
      <div class="card bg-base-100 border border-base-300 p-5">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div v-for="index in 4" :key="index" class="skeleton h-20 rounded-box"></div>
        </div>
      </div>
      <div class="card bg-base-100 border border-base-300 p-5 space-y-3">
        <div class="skeleton h-10 w-full"></div>
        <div class="skeleton h-72 w-full rounded-box"></div>
        <div class="skeleton h-4 w-52"></div>
      </div>
    </div>

    <div v-else-if="loadError && projects.length === 0" class="card bg-base-100 border border-base-300">
      <EmptyState type="error" title="开源项目清单加载失败" :message="loadError" />
      <div class="flex justify-center border-t border-base-300 p-3">
        <button class="btn rounded-lg btn-neutral btn-sm" type="button" @click="fetchProjects">重新加载</button>
      </div>
    </div>

    <template v-else>
      <div class="stats stats-vertical lg:stats-horizontal shadow border border-base-300 bg-base-100 w-full mb-4">
        <div v-for="card in summaryCards" :key="card.label" class="stat place-items-center">
          <div class="stat-title">{{ card.label }}</div>
          <div class="stat-value">{{ card.value }}</div>
          <div class="stat-desc">当前清单统计</div>
        </div>
      </div>

      <div class="card bg-base-100 card-border border-base-300 p-4">
        <h3 class="font-semibold mb-3">项目列表</h3>

        <div class="mb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <fieldset class="fieldset min-w-0 w-full xl:col-span-2">
            <legend class="fieldset-legend"><label :for="`${formFieldId}-1`">搜索</label></legend>
            <input :id="`${formFieldId}-1`"
              v-model="searchText"
              type="search"
              class="input input-bordered w-full"
              placeholder="名称、包名、用途或许可证"
            />
          </fieldset>

          <fieldset class="fieldset min-w-0 w-full">
            <legend class="fieldset-legend"><label :for="`${formFieldId}-2`">所属组件</label></legend>
            <select :id="`${formFieldId}-2`" v-model="selectedEcosystem" class="select select-bordered w-full">
              <option v-for="option in ecosystemOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </fieldset>

          <fieldset class="fieldset min-w-0 w-full">
            <legend class="fieldset-legend"><label :for="`${formFieldId}-3`">许可证</label></legend>
            <select :id="`${formFieldId}-3`" v-model="selectedLicense" class="select select-bordered w-full">
              <option v-for="license in licenseOptions" :key="license" :value="license">
                {{ license === 'all' ? '全部许可证' : license }}
              </option>
            </select>
          </fieldset>
        </div>

        <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span class="text-xs opacity-70">显示 {{ filteredProjects.length }} / {{ projects.length }} 个项目</span>
          <div class="flex gap-2">
            <button
              class="btn btn-ghost btn-xs"
              type="button"
              :disabled="searchText === '' && selectedEcosystem === 'all' && selectedLicense === 'all'"
              @click="resetFilters"
            >
              重置筛选
            </button>
            <button class="btn rounded-lg btn-neutral btn-xs" type="button" :disabled="isLoading" @click="fetchProjects">
              {{ isLoading ? '刷新中...' : '刷新数据' }}
            </button>
          </div>
        </div>

        <EmptyState
          v-if="filteredProjects.length === 0"
          title="没有匹配的开源项目"
          message="请更换搜索词或重置筛选条件。"
        />

        <div v-else class="overflow-x-auto rounded-box border border-base-300">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>项目</th>
                <th>组件</th>
                <th>版本</th>
                <th>许可证</th>
                <th>用途</th>
                <th class="text-right">链接</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="project in filteredProjects" :key="`${project.ecosystem}:${project.package}`">
                <td>
                  <p class="font-medium">{{ project.name }}</p>
                  <p class="mt-0.5 font-mono text-xs opacity-55">{{ project.package }}</p>
                </td>
                <td>
                  <span class="badge badge-ghost whitespace-nowrap">
                    {{ ecosystemLabels[project.ecosystem] || project.ecosystem }}
                  </span>
                </td>
                <td class="font-mono text-xs whitespace-nowrap">{{ project.version }}</td>
                <td><span class="badge badge-outline whitespace-nowrap">{{ project.license }}</span></td>
                <td class="min-w-52 text-sm">{{ project.usage }}</td>
                <td>
                  <div class="flex justify-end gap-3 whitespace-nowrap">
                    <a
                      class="link text-xs"
                      :href="project.homepage"
                      target="_blank"
                      rel="noopener noreferrer"
                      :aria-label="`打开 ${project.name} 主页`"
                    >
                      主页
                    </a>
                    <a
                      class="link text-xs"
                      :href="project.repository"
                      target="_blank"
                      rel="noopener noreferrer"
                      :aria-label="`打开 ${project.name} 源码仓库`"
                    >
                      源码
                    </a>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="mt-3 text-xs opacity-50">此页面展示主要直接依赖，不代替完整的软件物料清单（SBOM）。</p>
      </div>
    </template>
  </div>
</template>
