<script setup>
import { computed } from 'vue'
import { nativeEvidence, serviceLabel } from '@/utils/serviceDetection'
const props = defineProps({ service: { type: String, default: null }, data: { type: Object, default: null } })
const evidence = computed(() => nativeEvidence(props.data))
</script>

<template>
  <details v-if="service && evidence.length" class="text-xs">
    <summary class="cursor-pointer leading-6"><span class="badge badge-outline badge-sm">{{ serviceLabel(service) }}</span></summary>
    <div class="my-2 min-w-48 space-y-2 rounded-lg border border-base-300 bg-base-200/50 p-3">
      <template v-for="item in evidence" :key="item.module">
        <p v-if="['opcua_pubsub','enip_io'].includes(item.module)">{{ serviceLabel(item.module) }} · 被动接收 · {{ item.result.confirmation }}；不代表源端口开放。</p>
        <p v-else-if="item.module === 'dns_udp'">DNS UDP 响应码：{{ item.result.response_code }}；事务及来源已校验。</p>
        <p v-else-if="item.module === 'enip_udp'">EtherNet/IP UDP · Vendor {{ item.result.vendor_id }} · {{ item.result.product_name }}</p>
        <p v-else-if="item.module === 'bacnet'">BACnet/IP · Device {{ item.result.device_instance }} · Vendor {{ item.result.vendor_id }}；按来源及接收窗口关联。</p>
        <p v-else-if="item.module === 'dns'">DNS TCP 响应码：{{ item.result.response_code }}；响应已通过请求关联校验。</p>
        <p v-else-if="item.module === 'dot'">DNS over TLS 响应码：{{ item.result.response_code }}；已验证证书及 DNS 响应。</p>
        <p v-else-if="item.module === 'doh'">DNS over HTTPS · {{ item.result.path }}；响应码：{{ item.result.dns?.response_code }}；已验证证书及 DNS 响应。</p>
        <p v-else-if="['mqtt','mqtts'].includes(item.module)">MQTT {{ item.result.protocol_version }} · CONNACK {{ item.result.connack_code }}<span v-if="item.result.authentication_required"> · 需要认证</span></p>
        <p v-else-if="item.module === 'modbus'">Modbus · Unit ID {{ item.result.unit_id }}<span v-if="item.result.exception_code"> · 异常码 {{ item.result.exception_code }}</span></p>
        <p v-else-if="item.module === 'enip'">EtherNet/IP · Vendor {{ item.result.vendor_id }} · {{ item.result.product_name }}</p>
        <p v-else-if="item.module === 's7'">经典 S7comm · PDU {{ item.result.negotiated_pdu_length }}；仅协商连接。</p>
        <p v-else-if="item.module === 'opcua'">OPC UA TCP · {{ item.result.confirmation }}；未创建应用会话。</p>
        <p v-else>RFB 协议版本：{{ item.result.protocol_version }}。仅确认服务端问候，未进行认证。</p>
      </template>
    </div>
  </details>
  <span v-else-if="['dns', 'vnc', 'dot', 'doh','modbus','enip','s7','opcua','mqtt','mqtts','bacnet','opcua_pubsub','enip_io'].includes(service)" class="badge badge-outline badge-sm">{{ serviceLabel(service) }}</span>
  <span v-else>{{ serviceLabel(service) }}</span>
</template>
