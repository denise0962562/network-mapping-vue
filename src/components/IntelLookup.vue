<script setup>
import { tr } from '../i18n/index.js'

import { onBeforeUnmount, ref, watch } from 'vue'
import http from '../utils/http'
import IntelEvidence from './IntelEvidence.vue'
const props = defineProps({ type: { type: String, required: true }, value: { type: String, default: '' } })
const intel = ref(null)
let version = 0, timer, controller
watch(() => [props.type, props.value], ([type, value]) => {
  const request = ++version
  clearTimeout(timer); controller?.abort(); intel.value = null
  if (!value) return
  timer = setTimeout(async () => {
    controller = new AbortController()
    try {
      const response = await http.get('/api/intel/lookup', { params: { type, value }, signal: controller.signal })
      if (request === version) intel.value = response.data.data
    } catch (e) { if (request === version && e.code !== 'ERR_CANCELED') intel.value = { available: false } }
  }, 300)
}, { immediate: true })
onBeforeUnmount(() => { version++; clearTimeout(timer); controller?.abort() })
</script>
<template><IntelEvidence :intel="intel" :label="type === &#39;asn&#39; ? tr(&quot;ASN 情报&quot;) : tr(&quot;情报&quot;)" /></template>
