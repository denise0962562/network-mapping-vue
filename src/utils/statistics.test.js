import assert from 'node:assert/strict'
import test from 'node:test'
import { availableCharts, chartRows, chartSeries, queryBody, statisticsCsv, enrichStatistics, metricDifference } from './statistics.js'
import { timeSettings } from './systemTime.js'

test('calendar date ranges use exclusive local midnight across DST', () => {
  const timezone = timeSettings.timezone
  try {
    timeSettings.timezone = 'America/New_York'
    const body = queryBody({ start_date: '2026-03-08', end_date: '2026-03-08', data_type: 'discovery', group_by: 'day' }, timeSettings.timezone)
    assert.equal(body.start_at, '2026-03-08T05:00:00.000Z')
    assert.equal(body.end_at, '2026-03-09T04:00:00.000Z')
    assert.throws(() => queryBody({ start_date: '2026-03-09', end_date: '2026-03-08' }, timezone), /开始日期/)
    assert.throws(() => queryBody({ start_date: '2025-01-01', end_date: '2026-03-08' }, timezone), /366/)
  } finally { timeSettings.timezone = timezone }
})

test('Top N only affects charts and other keeps exact counts', () => {
  const rows = [{ label: '80', count: 8 }, { label: '443', count: 9 }, { label: '22', count: 2 }]
  const shown = chartRows(rows, { data_type: 'port', group_by: 'port' }, 1)
  assert.deepEqual(shown, [{ label: '443', count: 9 }, { label: '其他', count: 10, percentage: 52.6 }])
  assert.equal(rows.length, 3)
  assert.equal(chartRows(rows, { group_by: 'day' }, 1).length, 3)
})

test('heatmaps keep full dates and out-of-range cells distinct from zero', () => {
  const series = chartSeries([{ label: '2026-10-01', count: 0 }, { label: '2026-10-02', count: 2 }], {}, 'count', 'heatmap')
  assert.equal(series.find((s) => s.name === '周四').data[0].y, 0)
  assert.equal(series.find((s) => s.name === '周三').data[0].y, null)
  assert.equal(series.find((s) => s.name === '周五').data[0].dateLabel, '2026-10-02')
})

test('chart types match metric and grouping without summing rates', () => {
  assert.deepEqual(availableCharts({ charts: ['bar', 'line', 'stacked'] }, 'scanner', 'success_rate'), ['bar'])
  assert.deepEqual(availableCharts({ charts: ['bar', 'donut'] }, 'service', 'percentage'), ['bar'])
  assert.deepEqual(availableCharts({ charts: ['bar', 'line', 'heatmap'] }, 'week', 'count'), ['bar', 'line'])
})

test('full exports retain precision, filters, summary and formula-safe labels', () => {
  const result = { meta: { data_type: 'service', group_by: 'service', start_at: '2026-09-30T16:00:00Z', end_at: '2026-10-01T16:00:00Z',
    timezone: 'Asia/Shanghai', generated_at: '2026-10-02T00:00:00Z', task_source: 'search', metric_version: 1, mode: 'snapshot', notes: ['不是资产存量'] },
  data: { summary: { count: 3 }, rows: [{ label: '=1+1', count: 2, percentage: 66.7 }, { label: 'ssh', count: 1, percentage: 33.3 }] } }
  const csv = statisticsCsv(result, { label: '服务分布', metrics: ['count', 'percentage'] })
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('"\'=1+1","2","66.7"'))
  assert.ok(csv.includes('"ssh","1","33.3"'))
  assert.ok(csv.includes('搜索生成'))
  assert.ok(csv.includes('不是资产存量'))
  assert.ok(csv.includes('"汇总：数量（个）","3"'))
})


test('derived metrics retain distinct totals, include empty days and exclude cancellations from rates', () => {
  const source = { meta: { data_type: 'discovery', group_by: 'day' }, data: { rows: [{ count: 4 }, { count: 0 }, { count: 2 }], summary: { unique_ips: 4 } } }
  const enriched = enrichStatistics(source)
  assert.deepEqual(enriched.data.summary, { unique_ips: 4, observed_days: 2, peak_count: 4, mean_count: 2 })
  assert.deepEqual(source.data.summary, { unique_ips: 4 })
  const summary = enrichStatistics({ meta: { data_type: 'tasks' }, data: { rows: [], summary: { succeeded: 7, failed: 2, partial: 1, cancelled: 5 } } }).data.summary
  assert.equal(summary.failure_rate, 20)
  assert.equal(summary.partial_rate, 10)
  const empty = enrichStatistics({ meta: { data_type: 'tasks' }, data: { rows: [], summary: { succeeded: 0, failed: 0, partial: 0, cancelled: 5 } } })
  assert.equal(empty.data.summary.failure_rate, null)
})

test('scanner ranking uses the selected metric and puts missing durations last', () => {
  const rows = [{ label: 'fast', completed: 100, p95_ms: 10 }, { label: 'slow', completed: 1, p95_ms: 100 }, { label: 'none', completed: 200, p95_ms: null }]
  assert.deepEqual(chartRows(rows, { data_type: 'scanners', group_by: 'scanner' }, 2, 'p95_ms').map(r => r.label), ['slow', 'fast'])
  assert.equal(rows[0].label, 'fast')
  assert.equal(metricDifference(20, 10, 'failure_rate'), '+10 个百分点')
  assert.equal(metricDifference(20, 0, 'count'), '+20')
  assert.equal(metricDifference(20, null, 'count'), '--')
})

test('concentration uses the complete distribution, including categories outside Top N', () => {
  const rows = [1, 2, 3, 4, 5, 6].map(count => ({ count }))
  const result = enrichStatistics({ meta: { data_type: 'port' }, data: { rows, summary: { count: 21 } } })
  assert.equal(result.data.summary.top5_share, 20 / 21 * 100)
})
