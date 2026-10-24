<script setup>
import { tr } from '../i18n/index.js'

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
  { value: 'all', get label() { return tr("全部组件") } },
  { value: 'backend', get label() { return tr("服务端") } },
  { value: 'scanner', get label() { return tr("扫描器") } },
  { value: 'shared-rust', get label() { return tr("Rust 共用") } },
  { value: 'frontend', get label() { return tr("前端") } }
]

const ecosystemLabels = computed(() => Object.fromEntries(
  ecosystemOptions.filter((option) => option.value !== 'all').map((option) => [option.value, option.label])
))

const licenseOptions = computed(() => [
  'all',
  ...new Set(projects.value.map((project) => project.license).filter(Boolean).sort())
])
const hasCustomLicenses = computed(() => projects.value.some(project => project.license?.startsWith('LicenseRef-ApexCharts')))

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
  { get label() { return tr("项目总数") }, value: projects.value.length },
  {
    get label() { return tr("服务端相关") },
    value: projects.value.filter((project) => ['backend', 'shared-rust'].includes(project.ecosystem)).length
  },
  {
    get label() { return tr("扫描器相关") },
    value: projects.value.filter((project) => ['scanner', 'shared-rust'].includes(project.ecosystem)).length
  },
  { get label() { return tr("前端相关") }, value: projects.value.filter((project) => project.ecosystem === 'frontend').length }
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
    loadError.value = tr("无法获取开源项目清单，请检查服务状态后重试。")
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchProjects)
</script>

<template>
  <div class="page-shell">
    <div class="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="page-title">{{ tr("开源项目") }}</h1>
        <p class="text-xs opacity-60">{{ tr("本系统直接使用的第三方软件、开发工具与许可证信息") }}</p>
      </div>
      <p v-if="lastReviewed" class="text-xs opacity-60">{{ tr("清单复核日期：") }}{{ lastReviewed }}</p>
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
      <EmptyState type="error" :title="tr(&quot;开源项目清单加载失败&quot;)" :message="loadError" />
      <div class="flex justify-center border-t border-base-300 p-3">
        <button class="btn rounded-lg btn-neutral btn-sm" type="button" @click="fetchProjects">{{ tr("重新加载") }}</button>
      </div>
    </div>

    <template v-else>
      <div class="stats stats-vertical lg:stats-horizontal shadow border border-base-300 bg-base-100 w-full mb-4">
        <div v-for="card in summaryCards" :key="card.label" class="stat place-items-center">
          <div class="stat-title">{{ card.label }}</div>
          <div class="stat-value">{{ card.value }}</div>
          <div class="stat-desc">{{ tr("当前清单统计") }}</div>
        </div>
      </div>

      <div class="card bg-base-100 card-border border-base-300 p-4">
        <h3 class="font-semibold mb-3">{{ tr("项目列表") }}</h3>

        <div class="mb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <fieldset class="fieldset min-w-0 w-full xl:col-span-2">
            <legend class="fieldset-legend"><label :for="`${formFieldId}-1`">{{ tr("搜索") }}</label></legend>
            <input :id="`${formFieldId}-1`"
              v-model="searchText"
              type="search"
              class="input input-bordered w-full"
              :placeholder="tr(&quot;名称、包名、用途或许可证&quot;)"
            />
          </fieldset>

          <fieldset class="fieldset min-w-0 w-full">
            <legend class="fieldset-legend"><label :for="`${formFieldId}-2`">{{ tr("所属组件") }}</label></legend>
            <select :id="`${formFieldId}-2`" v-model="selectedEcosystem" class="select select-bordered w-full">
              <option v-for="option in ecosystemOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </fieldset>

          <fieldset class="fieldset min-w-0 w-full">
            <legend class="fieldset-legend"><label :for="`${formFieldId}-3`">{{ tr("许可证") }}</label></legend>
            <select :id="`${formFieldId}-3`" v-model="selectedLicense" class="select select-bordered w-full">
              <option v-for="license in licenseOptions" :key="license" :value="license">
                {{ license === 'all' ? tr("全部许可证") : license }}
              </option>
            </select>
          </fieldset>
        </div>

        <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span class="text-xs opacity-70">{{ tr("显示") }} {{ filteredProjects.length }} / {{ projects.length }} {{ tr("个项目") }}</span>
          <div class="flex gap-2">
            <button
              class="btn btn-ghost btn-xs"
              type="button"
              :disabled="searchText === '' && selectedEcosystem === 'all' && selectedLicense === 'all'"
              @click="resetFilters"
            > {{ tr("重置筛选") }} </button>
            <button class="btn rounded-lg btn-neutral btn-xs" type="button" :disabled="isLoading" @click="fetchProjects">
              {{ isLoading ? tr("刷新中...") : tr("刷新数据") }}
            </button>
          </div>
        </div>

        <EmptyState
          v-if="filteredProjects.length === 0"
          :title="tr(&quot;没有匹配的开源项目&quot;)"
          :message="tr(&quot;请更换搜索词或重置筛选条件。&quot;)"
        />

        <div v-else class="overflow-x-auto rounded-box border border-base-300">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>{{ tr("项目") }}</th>
                <th>{{ tr("组件") }}</th>
                <th>{{ tr("版本") }}</th>
                <th>{{ tr("许可证") }}</th>
                <th>{{ tr("用途") }}</th>
                <th class="text-right">{{ tr("链接") }}</th>
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
                <td><span class="badge badge-outline h-auto max-w-64 whitespace-normal py-1">{{ project.license }}</span></td>
                <td class="min-w-52 text-sm">{{ project.usage }}</td>
                <td>
                  <div class="flex justify-end gap-3 whitespace-nowrap">
                    <a
                      class="link text-xs"
                      :href="project.homepage"
                      target="_blank"
                      rel="noopener noreferrer"
                      :aria-label="tr(&quot;打开 {0} 主页&quot;, [project.name])"
                    > {{ tr("主页") }} </a>
                    <a
                      class="link text-xs"
                      :href="project.repository"
                      target="_blank"
                      rel="noopener noreferrer"
                      :aria-label="tr(&quot;打开 {0} 源码仓库&quot;, [project.name])"
                    > {{ tr("源码") }} </a>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="mt-3 text-xs opacity-60">{{ tr("清单覆盖三个应用的直接包依赖（含构建与开发依赖）。版本为依赖声明的范围，多个声明以 / 分隔，不代表部署版本；外部引擎、系统软件、第三方数据和传递依赖未在此列出。本页不代替完整的软件物料清单（SBOM）。") }}</p>
        <p v-if="hasCustomLicenses" class="mt-2 text-xs opacity-60">{{ tr("ApexCharts、ApexMaps 及其 Vue 组件采用自定义授权，源码可见不代表采用开源许可证；具体条款见") }} <a href="https://apexcharts.com/license/" target="_blank" rel="noopener noreferrer" class="link">{{ tr("ApexCharts 授权说明") }}</a>。</p>
      </div>
    </template>
  </div>
</template>
