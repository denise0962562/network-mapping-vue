<script setup>
  import { useRoute } from 'vue-router'
  import { ref } from 'vue'

  let id = ref(null)
  id = useRoute().params.taskid
  console.log(`ID: \n ${id}`)

</script>

<template>
  <h1>{{ id }}</h1>
</template>