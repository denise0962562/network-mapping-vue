import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { computed, ref } from 'vue'
import { parse, compileScript } from 'vue/compiler-sfc'
import * as llm from '../utils/llm.js'
const { descriptor } = parse(readFileSync(new URL('./LlmProviders.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'llm-provider-test' })
const source = compiled.scriptSetupAst.filter(n => n.type === 'ImportDeclaration').reverse().reduce((s, n) => s.slice(0, n.start) + s.slice(n.end), descriptor.scriptSetup.content)
function page(http) {
  let dispose
  const p = vm.runInNewContext(`${source}\n;({form,global,state,editor,open,saveProvider,saveGlobal,remove,refreshModels,load,error,editing})`, { ...llm, computed, ref, AbortController, crypto: { randomUUID: () => 'id' }, window: { confirm: () => true }, onMounted: () => {}, onBeforeUnmount: fn => { dispose = fn }, useUnsavedChanges: () => {}, http })
  p.editor.value = { showModal() {}, close() {} }
  return { ...p, dispose: () => dispose() }
}
const provider = () => llm.providerForm({ id: 'one', name: 'saved', credential_configured: true, database_credential_configured: true, transport: { ...llm.transportForm(), headers: [{ name: 'X-Token', value: '', configured: true }] } })
const state = () => ({ revision: 5, enabled: true, provider_id: 'one', model_id: 'a', global: llm.transportForm(true), providers: [provider()], presets: [] })
test('editing and subsequent saves preserve secret markers and never resend a new key', async () => {
  const writes = []
  const p = page({ get: async () => ({ data: { data: state() } }), put: async (_url, body) => { writes.push(JSON.parse(JSON.stringify(body))) } })
  await p.load(); p.open(p.state.value.providers[0]); p.form.value.credential = 'new-private-key'; await p.saveProvider()
  assert.equal(p.form.value.credential, '')
  p.open(p.state.value.providers[0]); p.form.value.name = 'renamed'; await p.saveProvider()
  assert.equal(writes[0].provider.credential, 'new-private-key')
  assert.equal(writes[1].provider.credential, '')
  assert.equal(writes[1].provider.transport.headers[0].configured, true)
  p.dispose()
})
test('failed model refresh preserves the editable list and a revision conflict preserves the draft', async () => {
  const p = page({ get: async () => ({ data: { data: state() } }), post: async () => { throw new Error('offline') }, put: async () => { throw { response: { data: { code: 'intel_revision_conflict' } } } } })
  await p.load(); p.open(p.state.value.providers[0]); p.form.value.models = [{ id: 'manual', protocol: 'chat', available: true }]
  await p.refreshModels(); assert.equal(p.form.value.models[0].id, 'manual')
  p.form.value.name = 'unsaved'; assert.equal(await p.saveProvider(), false)
  assert.equal(p.form.value.name, 'unsaved'); assert.match(p.error.value, /刷新/)
  p.dispose()
})
