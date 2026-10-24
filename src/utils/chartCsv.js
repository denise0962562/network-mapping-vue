import { csvCell } from './reports.js'
import { calendarDate, formatDateTime, timeSettings } from './systemTime.js'

// Use chart series rather than displayed labels so values retain their precision.
export function chartCsvData({ series = [], options = {}, categoryHeader = '类别', valueHeader = '数量', unit = '' } = {}) {
  const type = options.chart?.type
  const valueLabel = (name) => unit ? `${name}（${unit}）` : name
  if (type === 'pie' || type === 'donut') {
    return {
      headers: [categoryHeader, valueLabel(valueHeader)],
      rows: series.map((value, index) => [options.labels?.[index] ?? index + 1, value])
    }
  }
  if (type === 'heatmap') {
    return {
      headers: [categoryHeader, '系列', valueLabel(valueHeader)],
      rows: series.flatMap((item) => item.data.map((point) => [point.dateLabel ?? point.x, item.rawName ?? item.name, point.y]))
        .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
    }
  }

  const datetime = options.xaxis?.type === 'datetime'
  const categories = options.xaxis?.categories || []
  const keys = new Map()
  const values = series.map((item) => {
    const byCategory = new Map()
    for (const [index, point] of (item.data || []).entries()) {
      const objectPoint = point !== null && typeof point === 'object'
      const category = objectPoint ? point.x : (categories[index] ?? index + 1)
      // Normalize timestamps so ISO strings and milliseconds share the same row.
      const key = datetime ? new Date(category).getTime() : category
      if (datetime && !Number.isFinite(key)) continue
      keys.set(key, datetime ? formatDateTime(key) : category)
      byCategory.set(key, objectPoint ? point.y : point)
    }
    return byCategory
  })
  const orderedKeys = [...keys.keys()]
  if (datetime) orderedKeys.sort((left, right) => left - right)
  return {
    headers: [datetime ? `时间（${timeSettings.timezone}）` : categoryHeader, ...series.map((item) => valueLabel(item.rawName ?? item.name))],
    rows: orderedKeys.map((key) => [keys.get(key), ...values.map((item) => item.get(key) ?? null)])
  }
}

export function chartCsv({ headers, rows }) {
  const cell = (value) => typeof value === 'number'
    ? `"${Number.isFinite(value) ? value : ''}"`
    : csvCell(value)
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

export function downloadChartCsv(data, filename) {
  if (!data.rows.length) return
  const blob = new Blob([chartCsv(data)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const safeName = String(filename || 'chart').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
  anchor.href = url
  anchor.download = `network-mapping-${safeName}-${calendarDate()}.csv`
  document.body.appendChild(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    // Give the browser time to start consuming the download before revoking it.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
