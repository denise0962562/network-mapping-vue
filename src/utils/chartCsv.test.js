import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chartCsv, chartCsvData, downloadChartCsv } from './chartCsv.js'
import { timeSettings } from './systemTime.js'

test('category charts export every series with original values, zeroes and gaps', () => {
  const data = chartCsvData({
    options: { chart: { type: 'bar' }, xaxis: { categories: ['2026-10-01', '2026-10-02'] } },
    series: [{ name: '成功', data: [0, 2] }, { name: '失败', data: [1] }],
    categoryHeader: '日期', unit: '个任务'
  })
  assert.deepEqual(data, {
    headers: ['日期', '成功（个任务）', '失败（个任务）'],
    rows: [['2026-10-01', 0, 1], ['2026-10-02', 2, null]]
  })
})

test('time series align differing timestamps and preserve all selected storage columns', () => {
  const data = chartCsvData({
    options: { xaxis: { type: 'datetime' } }, unit: '字节',
    series: [
      { name: 'PG: ips', data: [{ x: '2026-10-02T01:00:00Z', y: 1048576 }, { x: '2026-10-02T00:00:00Z', y: 0 }] },
      { name: 'ES: ports', data: [{ x: Date.parse('2026-10-02T00:00:00Z'), y: 2048 }, { x: '2026-10-02T02:00:00Z', y: null }] }
    ]
  })
  assert.deepEqual(data, {
    headers: ['时间（Asia/Shanghai）', 'PG: ips（字节）', 'ES: ports（字节）'],
    rows: [['2026-10-02 08:00:00', 0, 2048], ['2026-10-02 09:00:00', 1048576, null], ['2026-10-02 10:00:00', null, null]]
  })
})

test('exported timestamps follow system timezone and date format, while calendar labels stay unchanged', () => {
  const settings = { ...timeSettings }
  try {
    Object.assign(timeSettings, { timezone: 'UTC', dateFormat: 'DD/MM/YYYY' })
    const data = chartCsvData({ options: { xaxis: { type: 'datetime' } }, series: [{ name: 'P95', data: [{ x: 1790899200000, y: 1.23456789 }] }] })
    assert.deepEqual(data.headers, ['时间（UTC）', 'P95'])
    assert.deepEqual(data.rows, [['02/10/2026 00:00:00', 1.23456789]])
    assert.deepEqual(chartCsvData({ options: { xaxis: { categories: ['2026-10-02'] } }, series: [{ name: '完成', data: [2] }] }).rows, [['2026-10-02', 2]])
  } finally {
    Object.assign(timeSettings, settings)
  }
})

test('pie export includes named segments and the other bucket', () => {
  assert.deepEqual(chartCsvData({
    options: { chart: { type: 'pie' }, labels: ['HTTPS', 'SSH', '其他'] },
    series: [12, 0, 3], categoryHeader: '服务', valueHeader: '端点数'
  }), { headers: ['服务', '端点数'], rows: [['HTTPS', 12], ['SSH', 0], ['其他', 3]] })
})

test('heatmap exports full dates in chronological order and distinguishes future dates from zeroes', () => {
  assert.deepEqual(chartCsvData({
    options: { chart: { type: 'heatmap' } }, categoryHeader: '日期', valueHeader: '发现 IP 数',
    series: [
      { name: '周一', data: [{ x: '09/28', dateLabel: '2026-09-28', y: 0 }, { x: '10/05', dateLabel: '2026-10-05', y: null }] },
      { name: '周二', data: [{ x: '09/28', dateLabel: '2026-09-29', y: 3 }] }
    ]
  }), {
    headers: ['日期', '系列', '发现 IP 数'],
    rows: [['2026-09-28', '周一', 0], ['2026-09-29', '周二', 3], ['2026-10-05', '周一', null]]
  })
})

test('CSV is Excel compatible, escapes delimiters, quotes and newlines, and protects text from formulas', () => {
  const csv = chartCsv({
    headers: ['服务', '数量'],
    rows: [['中文,"名称"\n下一行', 1.23456789], ['=HYPERLINK("x")', 0], ['  +SUM(A1)', -2.5], ['@cmd', null], ['\tcmd', NaN], ['-cmd', Infinity]]
  })
  assert.equal(csv, '\uFEFF"服务","数量"\r\n"中文,""名称""\n下一行","1.23456789"\r\n"\'=HYPERLINK(""x"")","0"\r\n"\'  +SUM(A1)","-2.5"\r\n"\'@cmd",""\r\n"\'\tcmd",""\r\n"\'-cmd",""\r\n')
})

test('empty chart data contains no downloadable rows', () => {
  assert.deepEqual(chartCsvData().rows, [])
  assert.deepEqual(chartCsvData({ series: [{ name: 'P95', data: [] }] }).rows, [])
  assert.deepEqual(chartCsvData({ options: { chart: { type: 'pie' } } }).rows, [])
  assert.deepEqual(chartCsvData({ options: { chart: { type: 'heatmap' } } }).rows, [])
  downloadChartCsv({ headers: ['时间'], rows: [] }, 'empty')
})

test('download creates a CSV Blob, removes the link and revokes its URL after starting the download', async () => {
  const originalDocument = globalThis.document
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  const originalTimeout = globalThis.setTimeout
  let downloadedBlob, appended, clicked, removed, revoke
  const anchor = { click() { clicked = true }, remove() { removed = true } }
  try {
    globalThis.document = { createElement: () => anchor, body: { appendChild(value) { appended = value } } }
    URL.createObjectURL = (blob) => { downloadedBlob = blob; return 'blob:csv-test' }
    URL.revokeObjectURL = (url) => { revoke = url }
    globalThis.setTimeout = (callback) => { assert.ok(clicked); callback() }
    const data = { headers: ['IP', '经度'], rows: [['192.0.2.1', -122.42]] }
    downloadChartCsv(data, 'asset:192.0.2.1/location')
    assert.equal(downloadedBlob.type, 'text/csv;charset=utf-8')
    assert.equal(await downloadedBlob.text(), chartCsv(data).slice(1)) // Blob.text() decodes the BOM.
    assert.deepEqual([...new Uint8Array(await downloadedBlob.arrayBuffer()).slice(0, 3)], [239, 187, 191])
    assert.equal(appended, anchor)
    assert.ok(clicked && removed)
    assert.equal(anchor.href, 'blob:csv-test')
    assert.match(anchor.download, /^network-mapping-asset-192\.0\.2\.1-location-\d{4}-\d{2}-\d{2}\.csv$/)
    assert.equal(revoke, anchor.href)
  } finally {
    globalThis.document = originalDocument
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    globalThis.setTimeout = originalTimeout
  }
})
