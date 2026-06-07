<script setup>
import { onMounted, ref } from 'vue'

const isLoading = ref(true)

onMounted(() => {
  setTimeout(() => {
    isLoading.value = false
  }, 3000)
})

const projectList = ref([
  { name: 'Vue', version: '^3.5.29', license: 'MIT', usage: '前端框架' },
  { name: 'Vue Router', version: '^5.0.3', license: 'MIT', usage: '路由管理' },
  { name: 'ApexCharts', version: '^5.6.0', license: 'MIT', usage: '图表能力' },
  { name: 'vue3-apexcharts', version: '^1.10.0', license: 'MIT', usage: 'Vue 图表组件封装' },
  { name: 'Tailwind CSS', version: '^4.2.1', license: 'MIT', usage: '原子化样式' },
  { name: 'daisyUI', version: '^5.5.19', license: 'MIT', usage: 'UI 组件样式' },
  { name: 'Vite', version: '^7.3.1', license: 'MIT', usage: '构建与开发服务器' }
])
</script>

<template>
  <div class="p-5">
    <div class="card bg-base-100 card-border border-base-300 p-4">
      <div class="mb-3">
        <h2 class="text-lg font-semibold">开源项目</h2>
        <p class="text-xs opacity-60">当前项目使用的主要开源依赖（UI 示例）</p>
      </div>

      <div v-if="isLoading" class="skeleton h-64 w-full rounded-box"></div>

      <div v-else class="overflow-x-auto rounded-box border border-base-content/5 bg-base-100">
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Version</th>
              <th>License</th>
              <th>Usage</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in projectList" :key="item.name">
              <th>{{ index + 1 }}</th>
              <td>{{ item.name }}</td>
              <td>{{ item.version }}</td>
              <td>{{ item.license }}</td>
              <td>{{ item.usage }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
