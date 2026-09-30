import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import 'vue'

const source = readFileSync(new URL('../../public/assets/theme-init.js', import.meta.url), 'utf8')

function boot({ saved = null, dark = false, blocked = false } = {}) {
  const handlers = new Map()
  const media = {
    matches: dark,
    addEventListener: (name, handler) => handlers.set(`media:${name}`, handler)
  }
  const localStorage = {
    getItem() { if (blocked) throw new Error('Storage denied'); return saved },
    setItem(key, value) { if (blocked) throw new Error('Storage denied'); saved = value }
  }
  const window = {
    localStorage,
    matchMedia: () => media,
    addEventListener: (name, handler) => handlers.set(name, handler)
  }
  const document = { documentElement: { dataset: {}, style: {} } }
  runInNewContext(source, { window, document })
  return {
    window, document, controller: window.networkMappingTheme,
    saved: () => saved,
    system(value) { media.matches = value; handlers.get('media:change')() },
    storage(newValue, key = 'network_mapping_theme', storageArea = localStorage) {
      handlers.get('storage')({ key, newValue, storageArea })
    }
  }
}

test('restores explicit dark mode before application startup, even on a light system', () => {
  const runtime = boot({ saved: 'dark' })
  assert.equal(runtime.document.documentElement.dataset.theme, 'dark')
  assert.equal(runtime.document.documentElement.style.colorScheme, 'dark')
})

test('first visit and invalid stored preferences follow the operating system', () => {
  for (const saved of [null, 'invalid', '<script>']) {
    const { controller } = boot({ saved, dark: true })
    assert.equal(controller.getPreference(), 'system')
    assert.equal(controller.getTheme(), 'dark')
  }
})

test('only system preference responds to operating system changes', () => {
  const runtime = boot()
  runtime.system(true)
  assert.equal(runtime.controller.getTheme(), 'dark')
  runtime.controller.setPreference('light')
  runtime.system(false)
  runtime.system(true)
  assert.equal(runtime.controller.getTheme(), 'light')
  runtime.controller.setPreference('system')
  assert.equal(runtime.controller.getTheme(), 'dark')
  assert.equal(runtime.saved(), 'system')
})

test('changes are persisted and restored by a newly opened page', () => {
  const runtime = boot()
  runtime.controller.setPreference('dark')
  assert.equal(boot({ saved: runtime.saved() }).controller.getTheme(), 'dark')
})

test('storage events synchronize other pages, including clear and removal', () => {
  const runtime = boot({ saved: 'light', dark: true })
  runtime.storage('dark')
  assert.equal(runtime.controller.getPreference(), 'dark')
  runtime.storage(null)
  assert.equal(runtime.controller.getPreference(), 'system')
  runtime.storage('light')
  runtime.storage(null, null)
  assert.equal(runtime.controller.getTheme(), 'dark')
})

test('unrelated and session storage events cannot change the theme', () => {
  const runtime = boot({ saved: 'dark' })
  runtime.storage('light', 'network_mapping_search_history')
  runtime.storage('light', 'network_mapping_theme', {})
  runtime.storage(null, null, {})
  assert.equal(runtime.controller.getPreference(), 'dark')
})

test('storage denial still allows local selection and system following', () => {
  const runtime = boot({ blocked: true })
  runtime.controller.setPreference('dark')
  assert.equal(runtime.document.documentElement.dataset.theme, 'dark')
  runtime.controller.setPreference('system')
  runtime.system(false)
  assert.equal(runtime.controller.getTheme(), 'light')
})

test('theme subscribers receive the resolved state and can unsubscribe', () => {
  const runtime = boot({ dark: true })
  const states = []
  const unsubscribe = runtime.controller.subscribe(({ preference, theme }) => states.push([preference, theme]))
  runtime.controller.setPreference('light')
  runtime.controller.setPreference('system')
  unsubscribe()
  runtime.controller.setPreference('dark')
  assert.deepEqual(states, [['light', 'light'], ['system', 'dark']])
})

test('chart updates retain callbacks, zoom controls and data without mutating source options', async () => {
  const runtime = boot()
  globalThis.window = runtime.window
  globalThis.document = runtime.document
  globalThis.getComputedStyle = () => ({
    getPropertyValue: (name) => name === '--color-base-content'
      ? (runtime.controller.getTheme() === 'dark' ? '#eee' : '#111')
      : '#888'
  })
  try {
    const { useChartTheme } = await import('../composables/useChartTheme.js')
    const custom = () => 'custom tooltip'
    const options = {
      chart: { type: 'line', zoom: { enabled: true } },
      tooltip: { custom, shared: true },
      series: [{ name: 'CPU', data: [1, 2] }],
      plotOptions: { bar: { dataLabels: { total: { enabled: true, style: { fontSize: '13px' } } } } }
    }
    const themed = useChartTheme(() => options)
    assert.equal(Object.hasOwn(useChartTheme(() => ({ chart: { type: 'line' } })).value, 'plotOptions'), false)
    assert.equal(themed.value.theme.mode, 'light')
    runtime.controller.setPreference('dark')
    assert.equal(themed.value.theme.mode, 'dark')
    assert.equal(themed.value.tooltip.custom, custom)
    assert.equal(themed.value.tooltip.shared, true)
    assert.equal(themed.value.chart.zoom, options.chart.zoom)
    assert.equal(themed.value.series, options.series)
    assert.equal(themed.value.chart.foreColor, '#eee')
    assert.equal(themed.value.plotOptions.bar.dataLabels.total.style.color, '#eee')
    assert.equal(themed.value.plotOptions.bar.dataLabels.total.style.fontSize, '13px')
    assert.equal(options.theme, undefined)
    assert.equal(options.chart.foreColor, undefined)
    assert.equal(options.plotOptions.bar.dataLabels.total.style.color, undefined)
  } finally {
    delete globalThis.window
    delete globalThis.document
    delete globalThis.getComputedStyle
  }
})
