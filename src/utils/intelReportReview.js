// Refang for comparison only; retain offsets into the original article snapshot.
function comparableText(body) {
  let text = ''
  const starts = [], ends = []
  const pattern = /\[\.\]|\[:\/\/\]|\[:\]|hxxps?(?=:\/\/|\[:\]\/\/|\[:\/\/\])/gi
  let cursor = 0
  function append(value, start, end, replaced = false) {
    for (let i = 0; i < value.length; i++) {
      text += value[i]; starts.push(replaced ? start : start + i); ends.push(replaced ? end : start + i + 1)
    }
  }
  for (const match of body.matchAll(pattern)) {
    append(body.slice(cursor, match.index), cursor, match.index)
    const value = match[0].toLowerCase()
    append(value === '[.]' ? '.' : value === '[:]' ? ':' : value === '[://]' ? '://' : value.replace('hxxp', 'http'), match.index, match.index + match[0].length, true)
    cursor = match.index + match[0].length
  }
  append(body.slice(cursor), cursor, body.length)
  return { text, starts, ends }
}

function normalized(kind, value) {
  try {
    if (kind === 'asn') return `AS${BigInt(value.replace(/^AS\s*/i, ''))}`
    if (['md5', 'sha1', 'sha256'].includes(kind)) return value.toLowerCase()
    if (kind === 'ip') {
      if (value.includes(':')) return new URL(`http://[${value.replace(/^\[|\]$/g, '')}]/`).hostname.toLowerCase()
      const parts = value.split('.')
      return parts.length === 4 && parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255) ? parts.map(Number).join('.') : null
    }
    if (kind === 'ip_port') {
      const colon = value.lastIndexOf(':')
      const host = normalized('ip', value.slice(0, colon))
      const port = value.slice(colon + 1)
      return host && /^\d+$/.test(port) && Number(port) <= 65535 ? `${host}:${Number(port)}` : null
    }
    if (kind === 'domain') return new URL(`http://${value}/`).hostname.toLowerCase().replace(/\.$/, '')
    if (kind === 'url') {
      const scheme = value.includes('://')
      const url = new URL(scheme ? value : `http://${value}`)
      url.hash = ''
      return scheme ? url.href : `${url.host}${url.pathname}${url.search}${url.hash}`
    }
  } catch { return null }
  return null
}

const candidates = {
  ip: /(?:\d{1,3}\.){3}\d{1,3}|(?:[a-f\d]{0,4}:){2,}[a-f\d:.]*/gi,
  ip_port: /\[[a-f\d:.]+\]:\d+|(?:\d{1,3}\.){3}\d{1,3}:\d+|(?:[a-f\d]{0,4}:){2,}[a-f\d]+:\d+/gi,
  domain: /[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)+\.?/gu,
  url: /[a-z][a-z\d+.-]*:\/\/[^\s<>"'，。；、（）]+|[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)+(?::\d+)?\/[^\s<>"'，。；、（）]*/giu,
  md5: /[a-f\d]{32}/gi,
  sha1: /[a-f\d]{40}/gi,
  sha256: /[a-f\d]{64}/gi,
  asn: /(?:AS\s*)?\d+/gi,
}

export function articleIocLocations(body, records) {
  const result = new Map()
  if (typeof body !== 'string' || !body) return result
  const mapped = comparableText(body), encoder = new TextEncoder()
  const byKind = new Map()
  for (const record of records || []) {
    const value = normalized(record.type, record.value)
    if (!value || !candidates[record.type]) continue
    if (!byKind.has(record.type)) byKind.set(record.type, new Map())
    const values = byKind.get(record.type)
    values.set(value, [...(values.get(value) || []), record.id])
  }
  for (const [kind, values] of byKind) {
    if (['ip', 'domain', 'md5', 'sha1', 'sha256', 'asn'].includes(kind)) {
      const lower = mapped.text.toLowerCase()
      for (const [value, ids] of values) {
        if (!/^[\x00-\x7f]+$/.test(value) || value.includes('[')) continue
        const needle = value.toLowerCase()
        let index = lower.indexOf(needle)
        while (index >= 0) {
          const before = lower[index - 1] || '', after = lower[index + needle.length] || ''
          const boundary = kind === 'ip' ? /[\da-f.]/i : /[a-z\d_.-]/i
          if ((!before || !boundary.test(before)) && (!after || !boundary.test(after))) {
            const start = mapped.starts[index], end = mapped.ends[index + needle.length - 1]
            const span = { start: encoder.encode(body.slice(0, start)).length, end: encoder.encode(body.slice(0, end)).length, quote: body.slice(start, end), kind: 'ioc' }
            for (const id of ids) if (!result.has(id)) result.set(id, span)
            break
          }
          index = lower.indexOf(needle, index + needle.length)
        }
      }
    }
    for (const match of mapped.text.matchAll(candidates[kind])) {
      const raw = match[0].replace(/[),;]+$/, '')
      const before = mapped.text[match.index - 1] || '', after = mapped.text[match.index + raw.length] || ''
      // Never mistake a prefix, suffix, subdomain or longer hash for this IOC.
      const adjacent = kind === 'ip' ? /[\da-f.]/i : kind === 'ip_port' ? /[\da-f.:]/i : kind === 'asn' ? /[a-z\d]/i : kind === 'url' ? /[a-z\d_]/i : /[\p{L}\p{N}_.-]/u
      if ((before && adjacent.test(before)) || (after && adjacent.test(after))) continue
      const ids = values.get(normalized(kind, raw))
      if (!ids) continue
      const start = mapped.starts[match.index], end = mapped.ends[match.index + raw.length - 1]
      const span = { start: encoder.encode(body.slice(0, start)).length, end: encoder.encode(body.slice(0, end)).length, quote: body.slice(start, end), kind: 'ioc' }
      for (const id of ids) if (!result.has(id)) result.set(id, span)
    }
  }
  return result
}

export function reportReviewItems(records, decisions, attribution) {
  return records.filter(record => record.status === 'pending' && decisions[record.id]).map(record => ({ id: record.id, content_hash: record.content_hash, decision: decisions[record.id], ...(decisions[record.id] === 'approved' ? { attribution: attribution[record.id] || { action: 'keep' } } : {}) }))
}
