import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { computed, ref } from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { i18n, tr } from '../i18n/index.js'
import { formatDateTime } from '../i18n/time.js'
import { formatDateTime as exportDateTime, timeSettings } from '../utils/systemTime.js'
import { chartCsv } from '../utils/chartCsv.js'

const { descriptor } = parse(readFileSync(new URL('./StatisticsDetails.vue', import.meta.url), 'utf8'))
const ast = compileScript(descriptor, { id: 'statistics-details-test' }).scriptSetupAst
const code = ast.filter(node => node.type === 'ImportDeclaration').reverse()
  .reduce((source, node) => source.slice(0, node.start) + source.slice(node.end), descriptor.scriptSetup.content)

test('detail CSV keeps headers, booleans, status and 12-hour timestamps across UI languages', async () => {
  const oldSettings = { ...timeSettings }
  const oldLocale = i18n.global.locale.value
  try {
    Object.assign(timeSettings, { timezone: 'Asia/Shanghai', hourCycle: '12' })
    for (const data_type of ['tasks', 'scanners', 'service']) {
      let download
      const panel = vm.runInNewContext(`${code}\n;({rows,exportPage,value,labels,requestBody})`, {
        computed, ref, tr, formatDateTime, exportDateTime, chartCsv, Blob,
        defineProps: () => ({ result: { meta: { data_type, timezone: 'Asia/Shanghai', group_by: 'service' } }, row: { label: 'ssh' } }),
        defineEmits: () => () => {}, onMounted: () => {}, onBeforeUnmount: () => {},
        downloadBlob: (blob, filename) => { download = { blob, filename } },
      })
      panel.rows.value = [{ task_id: '=1+1', execution_id: 'execution', scanner_id: 'scanner', status: 'succeeded',
        created_at: '2026-10-23T16:15:00Z', started_at: '2026-10-23T16:15:00Z', observed_at: '2026-10-23T16:15:00Z', ended_at: null,
        created_in_period: true, completed_in_period: false, ip_address: '192.0.2.1', port: 22, service: 'ssh', category: 'ssh', count: 7.25 }]
      i18n.global.locale.value = 'zh-CN'
      panel.exportPage()
      const chinese = await download.blob.text()
      i18n.global.locale.value = 'en'
      assert.equal(panel.labels.task_id, 'Tasks')
      assert.equal(panel.value(panel.rows.value[0], 'status'), 'Succeeded')
      assert.match(panel.value(panel.rows.value[0], 'created_at'), /AM/)
      panel.exportPage()
      assert.equal(await download.blob.text(), chinese)
      assert.equal(download.filename, 'statistics-details-1.csv')
      assert.match(chinese, /上午/)
      assert.match(chinese, /'\=1\+1/)
      if (data_type === 'tasks') {
        assert.match(chinese, /"成功"/)
        assert.match(chinese, /"是","否"/)
      }
      assert.equal(panel.requestBody(null).category, 'ssh')
    }
  } finally {
    Object.assign(timeSettings, oldSettings)
    i18n.global.locale.value = oldLocale
  }
})
