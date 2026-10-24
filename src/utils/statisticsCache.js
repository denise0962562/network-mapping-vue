import { tr } from '../i18n/index.js'
export const cacheDefaults = { enabled: true, realtime_ttl_seconds: 30, history_ttl_seconds: 30, snapshot_ttl_seconds: 60, max_entries: 256, max_size_mib: 32, max_entry_kib: 2048 }
export const cacheFields = [
  { key: 'realtime_ttl_seconds', get label() { return tr("实时统计有效期（秒）") }, min: 5, max: 300 },
  { key: 'history_ttl_seconds', get label() { return tr("任务历史有效期（秒）") }, min: 5, max: 300 },
  { key: 'snapshot_ttl_seconds', get label() { return tr("快照统计有效期（秒）") }, min: 10, max: 900 },
  { key: 'max_entries', get label() { return tr("最大缓存条目数") }, min: 16, max: 4096 },
  { key: 'max_size_mib', get label() { return tr("总容量上限（MiB）") }, min: 8, max: 256 },
  { key: 'max_entry_kib', get label() { return tr("单条容量上限（KiB）") }, min: 256, max: 8192 },
]
export function validateCache(config) {
  if (typeof config.enabled !== 'boolean') return tr("请选择是否启用缓存")
  for (const field of cacheFields) {
    const value = config[field.key]
    if (!Number.isInteger(value) || value < field.min || value > field.max) return tr("{0}应为 {1}～{2} 的整数", [field.label, field.min, field.max])
  }
  if (config.max_entry_kib > config.max_size_mib * 1024) return tr("单条容量不能超过总容量")
  return ''
}
