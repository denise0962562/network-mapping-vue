import assert from 'node:assert/strict'
import test from 'node:test'
import { computed } from 'vue'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import messages from './en.json' with { type: 'json' }
import { i18n, tr } from './index.js'
import { notificationEvents } from '../utils/notifications.js'
import { automaticServiceRequirements } from '../utils/serviceDetection.js'
import { statisticsCsv, metrics } from '../utils/statistics.js'
import { chartCsvData } from '../utils/chartCsv.js'
import { formatTime, timeSettings } from '../utils/systemTime.js'
import { formatTime as displayTime } from './time.js'

test('English messages are complete, nonempty and preserve all interpolation slots', () => {
  for (const [source, translation] of Object.entries(messages)) {
    assert.ok(translation.trim(), source)
    assert.doesNotMatch(translation, /[\u4e00-\u9fff]/, source)
    assert.deepEqual(source.match(/\{\d+\}/g)?.sort() || [], translation.match(/\{\d+\}/g)?.sort() || [], source)
  }
})

test('every literal translation call in application sources has a catalog entry', () => {
  const root = new URL('../', import.meta.url)
  const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(join(directory, entry.name)) : [join(directory, entry.name)])
  for (const file of walk(root.pathname).filter(file => /\.(js|vue)$/.test(file) && !file.endsWith('.test.js'))) {
    const source = readFileSync(file, 'utf8').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&')
    for (const match of source.matchAll(/\btr\(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
      const raw = match[1]
      const text = raw.startsWith('"') ? JSON.parse(raw) : raw.slice(1, -1).replaceAll("\\'", "'")
      assert.ok(Object.hasOwn(messages, text), `${file}: ${text}`)
    }
  }
})

test('switching locale updates computed labels without changing protocol values or interpreting input', () => {
  const label = computed(() => notificationEvents[0].label)
  i18n.global.locale.value = 'en'
  assert.equal(label.value, 'Health alerts')
  assert.equal(tr('添加标签条件：{0}', ['<SCRIPT>alert(1)</SCRIPT>']), 'Add tag condition: <SCRIPT>alert(1)</SCRIPT>')
  assert.equal(tr('a raw user value'), 'a raw user value')
  const protocols = automaticServiceRequirements('udp_inventory')
  i18n.global.locale.value = 'zh-CN'
  assert.equal(label.value, '健康告警')
  assert.deepEqual(automaticServiceRequirements('udp_inventory'), protocols)
  assert.equal(notificationEvents[0].value, 'health.alert')
})

test('UI clock language preserves the system zone and fixed-format export defaults', () => {
  const previous = { ...timeSettings }
  Object.assign(timeSettings, { timezone: 'Asia/Shanghai', hourCycle: '12' })
  const instant = '2026-10-23T16:15:00Z'
  i18n.global.locale.value = 'en'
  assert.match(displayTime(instant), /AM/)
  assert.match(formatTime(instant), /上午/)
  assert.equal(timeSettings.timezone, 'Asia/Shanghai')
  Object.assign(timeSettings, previous)
})

test('CSV labels and precise values stay compatible when UI metrics change language', () => {
  const result = { meta: { group_by: 'task_source', timezone: 'Asia/Shanghai' }, data: { rows: [{ label: 'manual', count: 7.25 }], summary: { count: 7.25 } } }
  const definition = { label: '发现', metrics: ['count'] }
  i18n.global.locale.value = 'zh-CN'
  const chinese = statisticsCsv(result, definition)
  i18n.global.locale.value = 'en'
  assert.equal(metrics.count.label, 'Count')
  assert.equal(statisticsCsv(result, definition), chinese)
  assert.deepEqual(chartCsvData({ series: [{ name: 'Succeeded', rawName: '成功', data: [7.25] }] }), { headers: ['类别', '成功'], rows: [[1, 7.25]] })
})
