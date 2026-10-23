export const nativeServices = [
  { value: 'dns', label: 'DNS TCP' },
  { value: 'vnc', label: 'VNC' },
  { value: 'dot', label: 'DoT' },
  { value: 'doh', label: 'DoH' },
  { value: 'modbus', label: 'Modbus TCP' },
  { value: 'enip', label: 'EtherNet/IP TCP' },
  { value: 's7', label: 'S7' },
  { value: 'opcua', label: 'OPC UA TCP' },
  { value: 'mqtt', label: 'MQTT' },
  { value: 'mqtts', label: 'MQTTS' }
]
export const udpServices = [
  { value: 'dns_udp', label: 'DNS UDP' },
  { value: 'enip_udp', label: 'EtherNet/IP UDP' },
  { value: 'bacnet', label: 'BACnet/IP' }
]
export const passiveServices = [
  { value: 'opcua_pubsub', label: 'OPC UA UADP' },
  { value: 'enip_io', label: 'EtherNet/IP I/O' }
]
const protocols = [...nativeServices, ...udpServices, ...passiveServices]
export function supportsRequiredServices(scanner, required = []) {
  const capabilities = scanner?.scan_capabilities
  if (required.length && (!Number.isInteger(capabilities?.max_service_probes)
    || capabilities.max_service_probes < required.length)) return false
  return required.every(service => Array.isArray(capabilities?.service_protocols)
    && capabilities.service_protocols.includes(service))
}
export function serviceLabel(service) {
  if (service === 'dns') return 'DNS'
  if (service === 'enip') return 'EtherNet/IP'
  if (service === 'opcua') return 'OPC UA'
  return protocols.find(item => item.value === service)?.label || service || '-'
}
export function nativeEvidence(data) {
  if (data?.schema_version !== 2 || !Array.isArray(data.evidence)) return []
  return data.evidence.filter(item => protocols.some(p => p.value === item?.module)
    && item?.result && !item.truncated).slice(0, 2)
}
