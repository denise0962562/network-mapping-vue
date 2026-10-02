import http from './http.js'

export const versionRepositories = {
  frontend: 'wshijiang/network-mapping-vue',
  server: 'wshijiang/network-mapping',
  scanner: 'wshijiang/Network-Mapping-Scanner',
}

function parseVersion(value) {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/)
  if (!match) return null
  const prerelease = match[4]?.split('.') || []
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part[0] === '0')) return null
  return { numbers: match.slice(1, 4).map(BigInt), prerelease }
}

export function isNewerVersion(candidate, current) {
  const next = parseVersion(candidate)
  const previous = parseVersion(current)
  if (!next || !previous) return false
  for (let i = 0; i < 3; i++) {
    if (next.numbers[i] !== previous.numbers[i]) return next.numbers[i] > previous.numbers[i]
  }
  if (!next.prerelease.length || !previous.prerelease.length) {
    return !next.prerelease.length && previous.prerelease.length > 0
  }
  for (let i = 0; i < Math.max(next.prerelease.length, previous.prerelease.length); i++) {
    const a = next.prerelease[i]
    const b = previous.prerelease[i]
    if (a === undefined) return false
    if (b === undefined) return true
    if (a === b) continue
    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)
    if (aNumeric && bNumeric) return BigInt(a) > BigInt(b)
    if (aNumeric !== bNumeric) return !aNumeric
    return a > b
  }
  return false
}

export function latestStableTag(tags) {
  if (!Array.isArray(tags)) throw new Error('Invalid repository tags')
  return tags.reduce((latest, tag) => {
    const version = parseVersion(tag?.name)
    if (!version || version.prerelease.length) return latest
    return !latest || isNewerVersion(tag.name, latest) ? tag.name : latest
  }, '')
}

const checks = new Map()

// Shared browser-only cache: table rows and route changes reuse one check per repository.
export function checkLatestVersion(component) {
  const repository = versionRepositories[component]
  if (!repository || typeof window === 'undefined') return Promise.resolve('')
  const cached = checks.get(repository)
  if (cached && cached.expiresAt > Date.now()) return cached.promise
  const entry = { expiresAt: Infinity, promise: null }
  entry.promise = (async () => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    try {
      let latest = ''
      let page = 1
      while (true) {
        const response = await http.get(`https://api.github.com/repos/${repository}/tags`, {
          params: { per_page: 100, page },
          withCredentials: false,
          withXSRFToken: false,
          headers: { Accept: 'application/vnd.github+json' },
          signal: controller.signal,
          timeout: 8000,
        })
        const candidate = latestStableTag(response.data)
        if (candidate && (!latest || isNewerVersion(candidate, latest))) latest = candidate
        if (!/rel="next"/.test(response.headers.link || '')) break
        page++
      }
      entry.expiresAt = Date.now() + 60 * 60 * 1000
      return latest
    } catch {
      entry.expiresAt = Date.now() + 5 * 60 * 1000
      return ''
    } finally {
      window.clearTimeout(timeout)
    }
  })()
  checks.set(repository, entry)
  return entry.promise
}
