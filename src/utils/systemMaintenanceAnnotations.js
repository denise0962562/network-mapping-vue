import { ref, watch } from 'vue'
import http from './http'

const HISTORY_LIMIT = 100
const CACHE_TTL_MS = 60_000

let cachedHistory = []
let cacheUpdatedAt = 0
let pendingRequest = null

function toTimestamp(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

export async function loadSystemMaintenanceHistory() {
  if (Date.now() - cacheUpdatedAt < CACHE_TTL_MS) return cachedHistory
  if (pendingRequest) return pendingRequest

  pendingRequest = http.get('/api/admin/system-maintenance/history', {
    params: { limit: HISTORY_LIMIT, offset: 0 }
  })
    .then((response) => {
      const items = response.data?.data?.items
      cachedHistory = Array.isArray(items) ? items : []
      cacheUpdatedAt = Date.now()
      return cachedHistory
    })
    .catch(() => {
      cacheUpdatedAt = Date.now()
      return cachedHistory
    })
    .finally(() => {
      pendingRequest = null
    })

  return pendingRequest
}

export function useSystemMaintenanceTooltip() {
  const maintenanceTooltip = ref(null)

  function showMaintenanceTooltip(maintenance, event) {
    if (!event) return
    maintenanceTooltip.value = {
      maintenance,
      clientX: event.clientX,
      clientY: event.clientY,
      chartElement: event.currentTarget?.closest('.apexcharts-canvas') || null
    }
  }

  function hideMaintenanceTooltip() {
    maintenanceTooltip.value = null
  }

  return {
    maintenanceTooltip,
    showMaintenanceTooltip,
    hideMaintenanceTooltip
  }
}

export function useSystemMaintenanceAnnotations() {
  const maintenanceAnnotations = ref([])
  const maintenanceChartRef = ref(null)
  const tooltip = useSystemMaintenanceTooltip()

  watch([maintenanceAnnotations, maintenanceChartRef], ([annotations, chart]) => {
    chart?.updateOptions?.({ annotations: { xaxis: annotations } }, false, false)
  }, { flush: 'post' })

  return {
    maintenanceAnnotations,
    maintenanceChartRef,
    ...tooltip
  }
}

export function buildSystemMaintenanceAnnotations(history, {
  startAt,
  endAt,
  onLabelMouseEnter,
  onLabelMouseLeave
} = {}) {
  const rangeStart = toTimestamp(startAt)
  const rangeEnd = toTimestamp(endAt)

  return (Array.isArray(history) ? history : [])
    .map((item) => {
      const startedAt = toTimestamp(item.started_at)
      const endedAt = toTimestamp(item.ended_at) ?? Date.now()
      if (startedAt === null || endedAt < startedAt) return null
      if ((rangeStart !== null && endedAt < rangeStart) || (rangeEnd !== null && startedAt > rangeEnd)) {
        return null
      }

      return {
        x: rangeStart === null ? startedAt : Math.max(startedAt, rangeStart),
        x2: rangeEnd === null ? endedAt : Math.min(endedAt, rangeEnd),
        borderColor: '#f59e0b',
        fillColor: '#fbbf24',
        opacity: 0.16,
        label: {
          text: item.in_progress ? '系统维护中' : '系统维护',
          borderColor: '#f59e0b',
          mouseEnter(_annotation, event) {
            onLabelMouseEnter?.(item, event)
          },
          mouseLeave(_annotation, event) {
            onLabelMouseLeave?.(item, event)
          },
          style: {
            background: '#fef3c7',
            color: '#78350f',
            fontSize: '10px',
            fontWeight: 500,
            cssClass: 'system-maintenance-annotation-label'
          }
        }
      }
    })
    .filter(Boolean)
}
