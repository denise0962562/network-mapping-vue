import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { computed, ref, nextTick } from 'vue'
import { parse, compileScript } from 'vue/compiler-sfc'
import * as llm from '../utils/llm.js'

const { descriptor } = parse(readFileSync(new URL('./LlmBasic.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'llm-basic-test' })
const source = compiled.scriptSetupAst.filter(n => n.type === 'ImportDeclaration').reverse().reduce((s, n) => s.slice(0, n.start) + s.slice(n.end), descriptor.scriptSetup.content)
const fixture = () => ({ revision: 7, enabled: true, provider_id: 'one', model_id: 'a', global: llm.transportForm(true), providers: [{ id: 'one', default_model: 'a', models: [{ id: 'a', protocol: 'chat', available: true }] }, { id: 'two', default_model: 'b', models: [{ id: 'b', protocol: 'responses', available: true }] }] })
function page({ http, chatRequest } = {}) {
  let dispose
  const context = { ...llm, computed, ref, nextTick, crypto: { randomUUID: () => 'session-id' }, AbortController, window: { confirm: () => true }, onMounted: () => {}, onBeforeUnmount: fn => { dispose = fn }, useUnsavedChanges: () => {}, http: http || { get: async () => ({ data: { data: fixture() } }) }, chatRequest: chatRequest || (async () => {}) }
  const p = vm.runInNewContext(`${source}\n;({state,enabled,providerId,modelId,chatProvider,chatModel,messages,input,load,save,chooseProvider,chooseChatProvider,newSession,send,stop,generating,error})`, context)
  return { ...p, dispose: () => dispose() }
}
test('pausing saves the selected pair while temporary debugging keeps IOC binding intact', async () => {
  let sent
  const p = page({ http: { get: async () => ({ data: { data: fixture() } }), put: async (_url, body) => { sent = body } } })
  await p.load(); p.chatProvider.value = 'two'; p.chooseChatProvider()
  assert.equal(p.chatModel.value, 'b'); assert.equal(p.providerId.value, 'one')
  p.enabled.value = false; await p.save()
  assert.equal(sent.provider_id, 'one'); assert.equal(sent.model_id, 'a'); assert.equal(sent.enabled, false); assert.equal(sent.expected_revision, 7)
  p.dispose()
})
test('partial failed replies never become history for the next paid request', async () => {
  const calls = []
  const p = page({ chatRequest: async (body, _signal, emit) => {
    calls.push(body)
    if (calls.length === 1) { emit({ type: 'delta', text: 'partial-private-output' }); throw new Error('llm_stream_failed') }
    emit({ type: 'done', text: '<img src=x onerror=alert(1)>', elapsed_ms: 10, usage: {} })
  } })
  await p.load(); p.input.value = 'hello'; await p.send()
  assert.equal(p.messages.value[1].complete, false)
  p.input.value = 'retry'; await p.send()
  assert(!JSON.stringify(calls[1]).includes('partial-private-output'))
  assert.equal(p.messages.value[3].complete, true)
  assert(!descriptor.template.content.includes('v-html'))
  p.dispose()
})
test('new session cancels the old request and late events cannot repopulate the conversation', async () => {
  let emit, finish, signal
  const p = page({ chatRequest: async (_body, s, callback) => { signal = s; emit = callback; await new Promise(resolve => { finish = resolve }) } })
  await p.load(); p.input.value = 'hello'; const pending = p.send(); await new Promise(setImmediate)
  p.newSession(); assert(signal.aborted)
  emit({ type: 'delta', text: 'obsolete' }); finish(); await pending
  assert.equal(p.messages.value.length, 0); assert.equal(p.generating.value, false)
  p.dispose()
})
