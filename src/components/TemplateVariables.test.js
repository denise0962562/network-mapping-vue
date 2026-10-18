import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { computed, reactive, ref } from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'

const { descriptor } = parse(readFileSync(new URL('./TemplateVariables.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'template-variables' })
const code = compiled.scriptSetupAst.filter(node => node.type === 'ImportDeclaration').reverse()
  .reduce((text, node) => text.slice(0, node.start) + text.slice(node.end), descriptor.scriptSetup.content)
function createPanel(variables) {
  const props = reactive({variables})
  const panel = vm.runInNewContext(`${code}\n;({query,filteredVariables})`, {
    computed, ref, defineProps:()=>props, defineEmits:()=>()=>{},
  })
  return {...panel,props}
}

test('variables can be searched by name, description and example without case sensitivity', () => {
  const panel = createPanel([{key:'username',label:'用户名',example:'Admin'}, {key:'source_ip',label:'来源地址',example:'192.0.2.10'}])
  for (const query of [' USERNAME ', '用户名', 'admin']) {
    panel.query.value = query
    assert.equal(panel.filteredVariables.value.length, 1)
    assert.equal(panel.filteredVariables.value[0].key, 'username')
  }
  panel.query.value = '192.0.2'
  assert.equal(panel.filteredVariables.value[0].key, 'source_ip')
  panel.query.value = 'no matching variable'
  assert.equal(panel.filteredVariables.value.length, 0)
})

test('large catalogues remain fully available and filtering updates with the current template', () => {
  const panel = createPanel(Array.from({length:200}, (_,index) => ({key:`variable_${index}`,label:'说明',example:index})))
  assert.equal(panel.filteredVariables.value.length, 200)
  panel.query.value = 'variable_199'
  assert.equal(panel.filteredVariables.value[0].key, 'variable_199')
  panel.query.value = ''
  assert.equal(panel.filteredVariables.value.length, 200)
  panel.props.variables = [{key:'replacement',label:'新模板'}]
  assert.equal(panel.filteredVariables.value.length, 1)
  assert.equal(panel.filteredVariables.value[0].key, 'replacement')
})
