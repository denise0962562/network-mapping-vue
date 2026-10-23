export const nativeServices = [{ value: 'dns', label: 'DNS TCP' }, { value: 'vnc', label: 'VNC' }]
export function supportsRequiredServices(scanner, required = []) {
  const protocols = scanner?.scan_capabilities?.service_protocols
  return required.every(service => Array.isArray(protocols) && protocols.includes(service))
}
export function serviceLabel(service) {
  return ({ dns: 'DNS', vnc: 'VNC' })[service] || service || '-'
}
export function nativeEvidence(data) {
  if (data?.schema_version !== 2 || !Array.isArray(data.evidence)) return []
  return data.evidence.filter(item => ['dns', 'vnc'].includes(item?.module) && item?.result && !item.truncated).slice(0, 2)
}
