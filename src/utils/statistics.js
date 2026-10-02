import { chartCsv } from './chartCsv.js'
import { addCalendarDays, calendarDate, calendarMidnight, formatDateTime } from './systemTime.js'

export const groupLabels = { day: '按日', week: '按周', month: '按月', scanner: '按扫描器', task_source: '按任务来源', port: '按端口', service: '按服务' }
export const chartLabels = { line: '折线图', bar: '柱状图', donut: '环形图', stacked: '堆叠柱状图', heatmap: '热力图' }
export const metrics = {
  count: { label: '数量', unit: '个' }, unique_ips: { label: '周期去重 IP', unit: '个' }, categories: { label: '类别数', unit: '类' },
  percentage: { label: '占比', unit: '%' }, created: { label: '新建任务', unit: '个' }, completed: { label: '完成数量（含取消）', unit: '个' },
  succeeded: { label: '成功', unit: '个' }, failed: { label: '失败', unit: '个' }, partial: { label: '部分完成', unit: '个' }, cancelled: { label: '取消', unit: '个' },
  success_rate: { label: '成功率', unit: '%' }, avg_duration_ms: { label: '平均耗时', unit: 'ms' }, p95_ms: { label: 'P95 耗时', unit: 'ms' },
}
const sourceLabels = { manual: '手动任务', automatic: '自动任务', search: '搜索生成' }

export function rowLabel(label, group) {
  return group === 'task_source' ? (sourceLabels[label] || label) : label
}

export function defaultFilters(now = Date.now()) {
  const end = calendarDate(now)
  return { data_type: 'discovery', group_by: 'day', range: '30', start_date: addCalendarDays(end, -29), end_date: end, scanner_id: '', task_source: '' }
}

export function queryBody(filters, timezone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(filters.end_date)) throw new Error('请选择完整的开始和结束日期。')
  if (filters.start_date > filters.end_date) throw new Error('开始日期不能晚于结束日期。')
  const days = (new Date(`${filters.end_date}T12:00:00Z`) - new Date(`${filters.start_date}T12:00:00Z`)) / 86400_000 + 1
  if (days > 366) throw new Error('统计范围不能超过 366 天。')
  return {
    data_type: filters.data_type, group_by: filters.group_by, timezone,
    start_at: calendarMidnight(filters.start_date), end_at: calendarMidnight(addCalendarDays(filters.end_date, 1)),
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

export function chartRows(rows, meta, topN) {
  if (['day', 'week', 'month'].includes(meta.group_by)) return rows
  const ordered = [...rows].sort((a, b) => (b.count ?? b.completed ?? 0) - (a.count ?? a.completed ?? 0) || String(a.label).localeCompare(String(b.label)))
  const shown = ordered.slice(0, topN)
  if (['port', 'service'].includes(meta.data_type) && ordered.length > topN) {
    const rest = ordered.slice(topN)
    const count = rest.reduce((sum, row) => sum + row.count, 0)
    const total = ordered.reduce((sum, row) => sum + row.count, 0)
    shown.push({ label: '其他', count, percentage: total ? Math.round(count / total * 1000) / 10 : 0 })
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
    return weekdays.map((name, index) => ({ name, data: weeks.map((week) => {
      const date = addCalendarDays(week, index)
      return { x: week, y: values.has(date) ? values.get(date) : null, dateLabel: date }
    }) })).reverse()
  }
  return [{ name: metrics[metric].label, data: rows.map((row) => row[metric] ?? null) }]
}

export function formatMetric(value, key) {
  if (value === null || value === undefined) return '--'
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: ['percentage', 'success_rate'].includes(key) ? 1 : 2 })
}

export function statisticsCsv(result, definition, rows = result.data.rows, metricKeys = definition.metrics) {
  const { meta, data } = result
  const context = [
    ['数据类型', definition.label], ['汇总维度', groupLabels[meta.group_by]], ['开始时间（含）', meta.start_at], ['结束时间（不含）', meta.end_at],
    ['时区', meta.timezone], ['扫描器', meta.scanner_id || '全部'], ['任务来源', sourceLabels[meta.task_source] || '全部'],
    ['生成时间', meta.generated_at], ['处理水位', meta.data_as_of || '--'], ['数据模式', meta.mode], ['口径版本', meta.metric_version],
    ...Object.entries(data.summary).filter(([key]) => metrics[key]).map(([key, value]) => [`汇总：${metrics[key].label}（${metrics[key].unit}）`, value]),
    ...(meta.notes || []).map((note) => ['统计说明', note]), [],
    [groupLabels[meta.group_by], ...metricKeys.map((key) => `${metrics[key].label}（${metrics[key].unit}）`)],
    ...rows.map((row) => [rowLabel(row.label, meta.group_by), ...metricKeys.map((key) => row[key] ?? null)]),
  ]
  return chartCsv({ headers: ['统计分析', '值'], rows: context })
}

export function imageCaption(meta) {
  return `${formatDateTime(meta.start_at, meta.timezone)} 至 ${formatDateTime(meta.end_at, meta.timezone)}（结束不含） · ${meta.timezone}`
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
  document.body.appendChild(anchor)
  try { anchor.click() } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
}
