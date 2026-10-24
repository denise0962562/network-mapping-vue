<script setup>
import { tr } from '../i18n/index.js'

import { ref } from 'vue'
import DatabaseHistoryChart from '@/components/DatabaseHistoryChart.vue'
import ResourceHistoryChart from '@/components/ResourceHistoryChart.vue'

const emit = defineEmits(['error'])
const activeTab = ref('resource')
</script>

<template>
  <section class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-4 p-4 md:p-5">
      <div role="tablist" class="tabs tabs-box w-fit" :aria-label="tr(&quot;系统历史趋势类型&quot;)">
        <button
          type="button"
          role="tab"
          class="tab"
          :class="{ 'tab-active': activeTab === 'resource' }"
          :aria-selected="activeTab === 'resource'"
          @click="activeTab = 'resource'"
        > {{ tr("服务器资源") }} </button>
        <button
          type="button"
          role="tab"
          class="tab"
          :class="{ 'tab-active': activeTab === 'database' }"
          :aria-selected="activeTab === 'database'"
          @click="activeTab = 'database'"
        > {{ tr("数据库容量") }} </button>
      </div>

      <ResourceHistoryChart v-if="activeTab === 'resource'" @error="emit('error', $event)" />
      <DatabaseHistoryChart v-else @error="emit('error', $event)" />
    </div>
  </section>
</template>
