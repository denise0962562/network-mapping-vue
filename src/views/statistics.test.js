import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { computed, ref } from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import * as statistics from '../utils/statistics.js'
import * as systemTime from '../i18n/time.js'
import { i18n, tr } from '../i18n/index.js'

const { descriptor } = parse(readFileSync(new URL('./statistics.vue', import.meta.url), 'utf8'))
const ast = compileScript(descriptor, { id: 'statistics-select-test' }).scriptSetupAst
const code = ast.filter(node => node.type === 'ImportDeclaration').reverse()
  .reduce((source, node) => source.slice(0, node.start) + source.slice(node.end), descriptor.scriptSetup.content)

test('chart drill-down ignores aggregate rows in both languages and accepts real Other categories', () => {
  const panel = vm.runInNewContext(`${code}\n;({selectRow,detailRow,loading})`, {
    ...statistics, ...systemTime, computed, ref, tr, useId: () => 'fixture', watch: () => {}, onMounted: () => {}, onBeforeUnmount: () => {},
  })
  assert.match(descriptor.template.content, /@select="selectRow"/)
  const oldLocale = i18n.global.locale.value
  try {
    for (const locale of ['en', 'zh-CN']) {
      i18n.global.locale.value = locale
      const rows = statistics.chartRows([{ label: 'ssh', count: 5 }, { label: 'http', count: 2 }], { data_type: 'service', group_by: 'service' }, 1)
      panel.detailRow.value = null
      panel.selectRow(rows[1])
      assert.equal(panel.detailRow.value, null)
      for (const label of ['Other', '其他', 'ssh']) {
        panel.selectRow({ label, count: 1 })
        assert.equal(panel.detailRow.value.label, label)
      }
      panel.detailRow.value = null
      panel.loading.value = true
      panel.selectRow(rows[0])
      assert.equal(panel.detailRow.value, null)
      panel.loading.value = false
    }
  } finally { i18n.global.locale.value = oldLocale }
})
