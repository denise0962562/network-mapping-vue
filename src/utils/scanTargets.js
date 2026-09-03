const TARGET_LABELS = {
  ipv4: 'IPv4 / CIDR',
  ipv6: 'IPv6 / CIDR',
  domain: '域名'
}

function splitAddressAndPrefix(value, maxPrefix) {
  const parts = value.split('/')
  if (parts.length > 2 || !parts[0]) return null
  if (parts.length === 2) {
    if (!/^\d+$/.test(parts[1])) return null
    const prefix = Number(parts[1])
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) return null
  }
  return parts[0]
}

function isIpv4Address(value) {
  const octets = value.split('.')
  return octets.length === 4 && octets.every((octet) => (
    /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255
  ))
}

export function isIpv4Target(value) {
  const address = splitAddressAndPrefix(value, 32)
  return address !== null && isIpv4Address(address)
}

function ipv6GroupCount(address) {
  if (!address.includes(':') || address.includes('%')) return null
  const compressionParts = address.split('::')
  if (compressionParts.length > 2) return null
  const hasCompression = compressionParts.length === 2
  const [left, right = ''] = compressionParts
  if ((hasCompression && (left.endsWith(':') || right.startsWith(':')))
    || (!hasCompression && (address.startsWith(':') || address.endsWith(':')))) return null

  const tokens = [left, right]
    .flatMap((side) => side ? side.split(':') : [])
  let groups = 0
  for (const [index, token] of tokens.entries()) {
    if (token.includes('.')) {
      if (index !== tokens.length - 1 || !isIpv4Address(token)) return null
      groups += 2
    } else {
      if (!/^[0-9A-Fa-f]{1,4}$/.test(token)) return null
      groups += 1
    }
  }
  if (hasCompression ? groups >= 8 : groups !== 8) return null
  return groups
}

export function isIpv6Target(value) {
  const address = splitAddressAndPrefix(value, 128)
  return address !== null && ipv6GroupCount(address) !== null
}

export function isDomainTarget(value) {
  const domain = value.trim().replace(/\.$/, '').toLowerCase()
  if (!domain || domain.includes('/') || domain.includes(':')) return false
  if (/^\d+(?:\.\d+)*$/.test(domain)) return false
  const labels = domain.split('.')
  if (labels.length < 2) return false
  const octetLength = (text) => new TextEncoder().encode(text).length
  const wireLength = labels.reduce((length, label) => length + 1 + octetLength(label), 1)
  return octetLength(domain) <= 253
    && wireLength <= 255
    && labels.every((label) => (
      octetLength(label) >= 1
      && octetLength(label) <= 63
      && !label.startsWith('-')
      && !label.endsWith('-')
      && /^[a-z0-9-]+$/.test(label)
    ))
}

function classifyTarget(value) {
  if (isIpv4Target(value)) return 'ipv4'
  if (isIpv6Target(value)) return 'ipv6'
  if (isDomainTarget(value)) return 'domain'
  return null
}

function invalid(message) {
  return { valid: false, type: null, targets: [], separator: null, message }
}

export function parseScanTargets(input) {
  const value = String(input ?? '').replace(/\r\n?/g, '\n').trim()
  if (!value) return invalid('请输入至少一个 IPv4/CIDR、IPv6/CIDR 或域名目标。')

  const hasComma = value.includes(',')
  const hasNewline = value.includes('\n')
  if (hasComma && hasNewline) {
    return invalid('逗号和换行不能混合使用，请只选择一种分隔方式。')
  }

  const separator = hasComma ? 'comma' : hasNewline ? 'newline' : 'single'
  const rawTargets = separator === 'comma' ? value.split(',') : separator === 'newline' ? value.split('\n') : [value]
  if (separator === 'comma' && rawTargets.some((target) => !target.trim())) {
    return invalid('逗号之间不能包含空目标。')
  }
  const targets = rawTargets.map((target) => target.trim()).filter(Boolean)
  if (targets.length === 0) return invalid('请输入至少一个有效目标。')

  const classified = targets.map(classifyTarget)
  const invalidIndex = classified.findIndex((type) => type === null)
  if (invalidIndex !== -1) {
    return invalid(`第 ${invalidIndex + 1} 个目标“${targets[invalidIndex]}”格式不合法。`)
  }
  const types = new Set(classified)
  if (types.size !== 1) {
    return invalid('一次任务只能包含一种目标类型，不能混合 IPv4、IPv6 和域名。')
  }

  const type = classified[0]
  if (type === 'domain' && targets.length > 500) {
    return invalid('一次域名任务最多可包含 500 个目标。')
  }
  return {
    valid: true,
    type,
    targets: type === 'domain'
      ? targets.map((target) => target.replace(/\.$/, '').toLowerCase())
      : targets,
    separator,
    message: ''
  }
}

export function targetTypeLabel(type) {
  return TARGET_LABELS[type] || '未识别'
}
