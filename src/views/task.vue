<script setup>

  import { ref } from 'vue'

  let expandedRow = ref()

  let taskItems = ref([
    {
      taskId: "sdcdsa",
      scannerId: "scanner-01",
      target: "221.233.151.58/24",
      operator: 'System',
      startin: "Today",
      status: 0,
      remark: 'test remark'
    },
    {
      taskId: "sdcdsb",
      scannerId: "scanner-01",
      target: "47.122.119.248/24,212.59.218.33/24",
      operator: 'Admin',
      startin: "Today",
      status: 1,
      remark: 'scanner-01 Admin remark'
    }
  ])

  const stateConfig = {
    0: {class: 'scan_open', text: '扫描中'},
    1: {class: 'scan_success', text: '成功'},
    2: {class: 'scan_wait', text: '等待'},
    3: {class: 'scan_faild', text: '错误'}
  }

  function toggleRow(taskId) {
    if (expandedRow.value === taskId) {
      expandedRow.value = null
    } else {
      expandedRow.value = taskId
    }
  }

</script>

<template>
  <div class="flex justify-center">
    <div class="card bg-base-100 card-border m-2.5 border-base-300 w-[85%] p-5">

      <!--  -->
      <div class="flex flex-col space-y-2">
        <div class="overflow-x-auto">
          <!-- 开始 -->
          <table class="table table-fixed w-full">
            <!-- head -->
            <thead>
              <tr>
                <th class="w-10"></th>
                <th class="w-20">任务ID</th>
                <th class="w-20">扫描器</th>
                <th class="w-40">目标</th>
                <th class="w-30">操作者</th>
                <th class="w-28">状态</th>
              </tr>
            </thead>
            <!-- body -->
            <tbody>
              
              <template v-for="(taskItem, index) in taskItems" :key="taskItem.taskId">
                <tr class="hover:bg-base-300" @click="toggleRow(taskItem.taskId)">
                  <td class="w-10">{{ index + 1 }}</td>
                  <td class="w-20 truncate">{{ taskItem.taskId }}</td>
                  <td class="w-20 truncate">{{ taskItem.scannerId }}</td>
                  <td class="w-40 truncate">{{ taskItem.target }}</td>
                  <td class="w-30 truncate">{{ taskItem.operator }}</td>
                  <td class="w-28"><span class="scan_status w-full" :class="stateConfig[taskItem.status].class">{{ stateConfig[taskItem.status].text }}</span></td>
                </tr>
                <tr v-if="expandedRow === taskItem.taskId">
                  <td class="w-10"></td>
                  <!-- 将 colspan 设置为5以实现占5列的空间，避免所有内容挤在一列中 -->
                  <td colspan="5" class="w-full">{{ taskItem.remark }}</td>
                </tr>
              </template>
              

            </tbody>


          </table>
        </div>
      </div>
    </div>
  </div>
</template>

