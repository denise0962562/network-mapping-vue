const csvGroupLabels = { day: '按日', week: '按周', month: '按月', scanner: '按扫描器', task_source: '按任务来源', port: '按端口', service: '按服务' }
const csvMetrics = {
  count: { label: '数量', unit: '个' }, unique_ips: { label: '周期去重 IP', unit: '个' }, categories: { label: '类别数', unit: '类' },
  percentage: { label: '占比', unit: '%' }, created: { label: '新建任务', unit: '个' }, completed: { label: '完成数量（含取消）', unit: '个' },
  succeeded: { label: '成功', unit: '个' }, failed: { label: '失败', unit: '个' }, partial: { label: '部分完成', unit: '个' }, cancelled: { label: '取消', unit: '个' },
  success_rate: { label: '成功率', unit: '%' }, avg_duration_ms: { label: '平均耗时', unit: 'ms' }, p95_ms: { label: 'P95 耗时', unit: 'ms' }, p50_ms: { label: 'P50 耗时', unit: 'ms' },
  observed_days: { label: '有观测天数', unit: '天' }, peak_count: { label: '单日峰值', unit: '个' }, mean_count: { label: '每日去重 IP 均值', unit: '个' }, top5_share: { label: 'Top 5 集中度', unit: '%' }, failure_rate: { label: '失败率', unit: '%' }, partial_rate: { label: '部分完成率', unit: '%' },
}
const csvSourceLabels = { manual: '手动任务', automatic: '自动任务', search: '搜索生成' }
import { tr } from '../i18n/index.js'
import { chartCsv } from './chartCsv.js'
import { addCalendarDays, calendarDate, calendarMidnight, formatDateTime } from './systemTime.js'

export const groupLabels = { get day() { return tr("按日") }, get week() { return tr("按周") }, get month() { return tr("按月") }, get scanner() { return tr("按扫描器") }, get task_source() { return tr("按任务来源") }, get port() { return tr("按端口") }, get service() { return tr("按服务") } }
export const chartLabels = { get line() { return tr("折线图") }, get bar() { return tr("柱状图") }, get donut() { return tr("环形图") }, get stacked() { return tr("堆叠柱状图") }, get heatmap() { return tr("热力图") } }
export const metrics = {
  count: { get label() { return tr("数量") }, get unit() { return tr("个") } }, unique_ips: { get label() { return tr("周期去重 IP") }, get unit() { return tr("个") } }, categories: { get label() { return tr("类别数") }, get unit() { return tr("类") } },
  percentage: { get label() { return tr("占比") }, unit: '%' }, created: { get label() { return tr("新建任务") }, get unit() { return tr("个") } }, completed: { get label() { return tr("完成数量（含取消）") }, get unit() { return tr("个") } },
  succeeded: { get label() { return tr("成功") }, get unit() { return tr("个") } }, failed: { get label() { return tr("失败") }, get unit() { return tr("个") } }, partial: { get label() { return tr("部分完成") }, get unit() { return tr("个") } }, cancelled: { get label() { return tr("取消") }, get unit() { return tr("个") } },
  success_rate: { get label() { return tr("成功率") }, unit: '%' }, avg_duration_ms: { get label() { return tr("平均耗时") }, unit: 'ms' }, p95_ms: { get label() { return tr("P95 耗时") }, unit: 'ms' }, p50_ms: { get label() { return tr("P50 耗时") }, unit: 'ms' },
  observed_days: { get label() { return tr("有观测天数") }, get unit() { return tr("天") } }, peak_count: { get label() { return tr("单日峰值") }, get unit() { return tr("个") } }, mean_count: { get label() { return tr("每日去重 IP 均值") }, get unit() { return tr("个") } }, top5_share: { get label() { return tr("Top 5 集中度") }, unit: '%' }, failure_rate: { get label() { return tr("失败率") }, unit: '%' }, partial_rate: { get label() { return tr("部分完成率") }, unit: '%' },
}
const sourceLabels = { get manual() { return tr("手动任务") }, get automatic() { return tr("自动任务") }, get search() { return tr("搜索生成") } }

export function rowLabel(label, group) {
  return group === 'task_source' ? (sourceLabels[label] || label) : label
}

export function defaultFilters(now = Date.now()) {
  const end = calendarDate(now)
  return { data_type: 'discovery', group_by: 'day', range: '30', start_date: addCalendarDays(end, -29), end_date: end, scanner_id: '', task_source: '', comparison: false, percentiles: false }
}

export function queryBody(filters, timezone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(filters.end_date)) throw new Error(tr("请选择完整的开始和结束日期。"))
  if (filters.start_date > filters.end_date) throw new Error(tr("开始日期不能晚于结束日期。"))
  const days = (new Date(`${filters.end_date}T12:00:00Z`) - new Date(`${filters.start_date}T12:00:00Z`)) / 86400_000 + 1
  if (days > 366) throw new Error(tr("统计范围不能超过 366 天。"))
  return {
    data_type: filters.data_type, group_by: filters.group_by, timezone,
    start_at: calendarMidnight(filters.start_date), end_at: calendarMidnight(addCalendarDays(filters.end_date, 1)),
    ...(filters.comparison ? { comparison: 'previous' } : {}),
    ...(filters.scanner_id ? { scanner_id: filters.scanner_id } : {}),
    ...(filters.task_source ? { task_source: filters.task_source } : {}),
  }
}

export function availableCharts(definition, group, metric) {
  return (definition?.charts || []).filter((type) => {
    if (type === 'line') return ['day', 'week', 'month'].includes(group)
    if (type === 'heatmap') return group === 'day'
    if (type === 'donut') return metric === 'count'
    if (type === 'stacked') return ['completed', 'succeeded', 'failed', 'partial', 'cancelled'].includes(metric)
    return true
  })
}

export function chartRows(rows, meta, topN, metric) {
  if (['day', 'week', 'month'].includes(meta.group_by)) return rows
  const rankingMetric = metric === 'percentage' ? 'count' : metric
  const ordered = [...rows].sort((a, b) => {
    const av = rankingMetric ? a[rankingMetric] : (a.count ?? a.completed)
    const bv = rankingMetric ? b[rankingMetric] : (b.count ?? b.completed)
    if (av == null) return bv == null ? 0 : 1
    if (bv == null) return -1
    return bv - av || String(a.label).localeCompare(String(b.label))
  })
  const shown = ordered.slice(0, topN)
  if (['port', 'service'].includes(meta.data_type) && ordered.length > topN) {
    const rest = ordered.slice(topN)
    const count = rest.reduce((sum, row) => sum + row.count, 0)
    const total = ordered.reduce((sum, row) => sum + row.count, 0)
    shown.push({ synthetic: true, get label() { return tr("其他") }, count, percentage: total ? Math.round(count / total * 1000) / 10 : 0 })
  }
  return shown
}

export function chartSeries(rows, meta, metric, type) {
  if (type === 'donut') return rows.map((row) => row[metric])
  if (type === 'stacked') return ['succeeded', 'failed', 'partial', 'cancelled'].map((key) => ({ name: metrics[key].label, data: rows.map((row) => row[key] ?? 0) }))
  if (type === 'heatmap') {
    const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    const weeks = [...new Set(rows.map((row) => {
      const day = new Date(`${row.label}T12:00:00Z`).getUTCDay()
      return addCalendarDays(row.label, -(day === 0 ? 6 : day - 1))
    }))]
    const values = new Map(rows.map((row) => [row.label, row[metric]]))
    return weekdays.map((name, index) => ({ rawName: name, name: tr(name), data: weeks.map((week) => {
      const date = addCalendarDays(week, index)
      return { x: week, y: values.has(date) ? values.get(date) : null, dateLabel: date }
    }) })).reverse()
  }
  return [{ name: metrics[metric].label, data: rows.map((row) => row[metric] ?? null) }]
}

export function formatMetric(value, key) {
  if (value === null || value === undefined) return '--'
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: ['percentage', 'success_rate', 'failure_rate', 'partial_rate', 'top5_share'].includes(key) ? 1 : 2 })
}

export function statisticsCsv(result, definition, rows = result.data.rows, metricKeys = definition.metrics) {
  const { meta, data } = result
  const context = [
    ['数据类型', definition.label], ['汇总维度', csvGroupLabels[meta.group_by]], ['开始时间（含）', meta.start_at], ['结束时间（不含）', meta.end_at],
    ['时区', meta.timezone], ['扫描器', meta.scanner_id || '全部'], ['任务来源', csvSourceLabels[meta.task_source] || '全部'],
    ['生成时间', meta.generated_at], ['处理水位', meta.data_as_of || '--'], ['数据模式', meta.mode], ['口径版本', meta.metric_version],
    ...Object.entries(data.summary).filter(([key]) => csvMetrics[key]).map(([key, value]) => [`汇总：${csvMetrics[key].label}（${csvMetrics[key].unit}）`, value]),
    ...(result.comparison ? [['对比开始时间', result.comparison.meta.start_at], ['对比结束时间', result.comparison.meta.end_at], ['对比说明', result.comparison.note], ...Object.entries(result.comparison.data.summary).filter(([key]) => csvMetrics[key]).map(([key, value]) => [`上期：${csvMetrics[key].label}`, value])] : []),
    ...(meta.notes || []).map((note) => ['统计说明', note]), [],
    [csvGroupLabels[meta.group_by], ...metricKeys.map((key) => `${csvMetrics[key].label}（${csvMetrics[key].unit}）`)],
    ...rows.map((row) => [(meta.group_by === 'task_source' ? (csvSourceLabels[row.label] || row.label) : row.label), ...metricKeys.map((key) => row[key] ?? null)]),
  ]
  return chartCsv({ headers: ['统计分析', '值'], rows: context })
}

export function imageCaption(meta) {
  return tr("{0} 至 {1}（结束不含） · {2}", [formatDateTime(meta.start_at, meta.timezone), formatDateTime(meta.end_at, meta.timezone), meta.timezone])
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
  document.body.appendChild(anchor)
  try { anchor.click() } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
}

export function enrichStatistics(result) {
  const { rows, summary } = result.data
  const enriched = { ...summary }
  if (result.meta.data_type === 'discovery' && result.meta.group_by === 'day') {
    enriched.observed_days = rows.filter((r) => r.count > 0).length
    enriched.peak_count = rows.length ? Math.max(...rows.map((r) => r.count)) : null
    enriched.mean_count = rows.length ? rows.reduce((n, r) => n + r.count, 0) / rows.length : null
  }
  if (['port', 'service'].includes(result.meta.data_type)) {
    enriched.top5_share = summary.count ? [...rows].sort((a, b) => b.count - a.count).slice(0, 5).reduce((n, r) => n + r.count, 0) / summary.count * 100 : null
  }
  if (['tasks', 'scanners'].includes(result.meta.data_type)) {
    const denominator = summary.succeeded + summary.failed + summary.partial
    enriched.failure_rate = denominator ? summary.failed / denominator * 100 : null
    enriched.partial_rate = denominator ? summary.partial / denominator * 100 : null
  }
  return { ...result, data: { ...result.data, summary: enriched }, ...(result.comparison ? { comparison: enrichStatistics(result.comparison) } : {}) }
}
export function metricDifference(current, previous, key) {
  if (current == null || previous == null) return '--'
  const delta = current - previous
  return `${delta > 0 ? '+' : ''}${formatMetric(delta, key)}${['success_rate', 'failure_rate', 'partial_rate', 'top5_share', 'percentage'].includes(key) ? tr(" 个百分点") : ''}`
}
