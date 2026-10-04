export const cacheDefaults = { enabled: true, realtime_ttl_seconds: 30, history_ttl_seconds: 30, snapshot_ttl_seconds: 60, max_entries: 256, max_size_mib: 32, max_entry_kib: 2048 }
export const cacheFields = [
  { key: 'realtime_ttl_seconds', label: '实时统计有效期（秒）', min: 5, max: 300 },
  { key: 'history_ttl_seconds', label: '任务历史有效期（秒）', min: 5, max: 300 },
  { key: 'snapshot_ttl_seconds', label: '快照统计有效期（秒）', min: 10, max: 900 },
  { key: 'max_entries', label: '最大缓存条目数', min: 16, max: 4096 },
  { key: 'max_size_mib', label: '总容量上限（MiB）', min: 8, max: 256 },
  { key: 'max_entry_kib', label: '单条容量上限（KiB）', min: 256, max: 8192 },
]
export function validateCache(config) {
  if (typeof config.enabled !== 'boolean') return '请选择是否启用缓存'
  for (const field of cacheFields) {
    const value = config[field.key]
    if (!Number.isInteger(value) || value < field.min || value > field.max) return `${field.label}应为 ${field.min}～${field.max} 的整数`
  }
  if (config.max_entry_kib > config.max_size_mib * 1024) return '单条容量不能超过总容量'
  return ''
}
