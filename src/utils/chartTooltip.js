import { formatDateTime as formatSystemDateTime, formatDate as formatSystemDate } from './systemTime.js'
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character])
}

export function formatChartTooltipTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value ?? '')
    : formatSystemDateTime(date)
}

export function renderChartTooltip({ title, rows = [], footer = '' }) {
  const body = rows
    .filter(Boolean)
    .map(({ label, value, color }) => {
      const marker = color
        ? `<i class="mr-1 inline-block size-2 rounded-full" style="background:${escapeHtml(color)}"></i>`
        : ''
      return `<div class="flex items-center justify-between gap-5"><span>${marker}${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`
    })
    .join('')
  const footerHtml = footer
    ? `<div class="pt-1 opacity-60">${escapeHtml(footer)}</div>`
    : ''

  return `<div class="space-y-1 p-2 text-xs"><div class="mb-1 font-semibold">${escapeHtml(title)}</div>${body}${footerHtml}</div>`
}
