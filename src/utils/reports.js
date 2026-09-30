export const reportStatuses = {
  queued: { label: '等待生成', class: 'badge-ghost' },
  waiting_data: { label: '等待统计', class: 'badge-warning' },
  generating: { label: '生成中', class: 'badge-info' },
  ready: { label: '已归档', class: 'badge-success' },
  failed: { label: '生成失败', class: 'badge-error' },
}

export const deliveryStatuses = {
  pending: '等待发送', sending: '发送中', sent: '已发送', failed: '发送失败', cancelled: '已取消',
}

export function reportDate(value, withTime = false) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(date)
}

export function reportPeriod(report) {
  return `${reportDate(report.period_start)} 至 ${reportDate(report.period_end)}（不含）`
}

export function csvCell(value) {
  let text = String(value ?? '')
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function reportCsv(report) {
  const payload = report.payload || {}
  const rows = [['报告类型', report.period_type === 'weekly' ? '周报' : '月报'], ['周期', reportPeriod(report)], ['修订号', report.revision], ['时区', 'Asia/Shanghai']]
  for (const [key, label] of Object.entries({ created: '新建任务', succeeded: '成功任务', failed: '失败任务', partial: '部分完成任务', cancelled: '取消任务', success_rate: '任务成功率（%）' })) {
    rows.push([label, payload.tasks?.[key]])
  }
  for (const [key, label] of Object.entries({ unique_ips: '成功执行发现的去重 IP', port_observations: '端口观测次数', service_observations: '服务观测次数' })) {
    rows.push([label, payload.scan_output?.[key]])
  }
  rows.push([], ['分布类型', '名称', '观测次数'])
  for (const [key, label] of [['ports', '端口'], ['services', '服务']]) {
    for (const item of payload.scan_output?.[key] || []) rows.push([label, item.name, item.count])
  }
  rows.push([], ['日期', '成功任务', '失败任务', '部分完成', '取消任务'])
  for (const day of payload.trend || []) rows.push([day.day, day.succeeded, day.failed, day.partial, day.cancelled])
  rows.push([], ['统计说明'])
  for (const note of payload.notes || []) rows.push([note])
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
}
