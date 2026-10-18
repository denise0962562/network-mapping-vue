import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { computed, nextTick, ref, watch } from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { notificationEvents, providerLabel } from '../utils/notifications.js'

const { descriptor } = parse(readFileSync(new URL('./BotTemplateEditor.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'bot-template-test' })
const code = compiled.scriptSetupAst.filter(node => node.type === 'ImportDeclaration').reverse()
  .reduce((text, node) => text.slice(0, node.start) + text.slice(node.end), descriptor.scriptSetup.content)
const initial = { provider:'feishu', eventType:'health.alert', revision:0, status:'default', variables:[], versions:[],
  source:{format:'text',titleTemplate:'title',bodyTemplate:'body'} }
const response = data => ({data:{success:true,data}})
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return {promise,resolve} }
function createPage(request = async () => response(initial), post = async () => response({htmlBody:'sample'})) {
  let dispose
  const page = vm.runInNewContext(`${code}\n;({load,apply,act,refreshPreview,source,saved,detail,preview,previewError,error,hasUnsavedChanges})`, {
    computed, nextTick, ref, watch, notificationEvents, providerLabel, AbortController,
    defineProps: () => ({provider:'feishu'}), defineExpose: () => {},
    http:Object.assign(request,{post}), setTimeout, clearTimeout,
    DOMPurify:{sanitize:value=>value}, formatDateTime:value=>value,
    useUnsavedChanges:()=>{}, onMounted:()=>{}, onBeforeUnmount:fn=>{dispose=fn}, window:{confirm:()=>true},
  })
  return {...page,dispose:()=>dispose()}
}

test('publishing unsaved changes saves the selected provider/event first and uses the returned revision', async () => {
  const calls=[]
  const page=createPage(async config => {
    calls.push(config)
    if (config.url.endsWith('/draft')) return response({...initial,status:'draft',revision:1,source:config.data.source})
    return response({...initial,status:'published',revision:2,source:calls[0].data.source})
  })
  page.apply(initial)
  page.source.value.bodyTemplate='edited'
  await page.act('publish')
  assert.equal(calls.length,2)
  assert.equal(calls[0].url,'/api/notifications/templates/feishu/health.alert/draft')
  assert.equal(calls[0].data.expectedRevision,0)
  assert.equal(calls[0].data.source.bodyTemplate,'edited')
  assert.equal(calls[1].data.expectedRevision,1)
  assert.equal(page.hasUnsavedChanges.value,false)
  page.dispose()
})

test('a conflict preserves edits and does not publish', async () => {
  let calls=0
  const page=createPage(async () => { calls++; throw {response:{data:{message:'配置已变化'}}} })
  page.apply(initial)
  page.source.value.bodyTemplate='keep this edit'
  await page.act('publish')
  assert.equal(calls,1)
  assert.equal(page.source.value.bodyTemplate,'keep this edit')
  assert.equal(page.hasUnsavedChanges.value,true)
  assert.equal(page.error.value,'配置已变化')
  page.dispose()
})

test('stale previews cannot replace the latest rendering even if cancellation is ignored', async () => {
  const first=deferred(), second=deferred()
  const calls=[]
  const page=createPage(undefined,(_,body,{signal}) => {calls.push({body,signal});return calls.length===1?first.promise:second.promise})
  const pendingFirst=page.refreshPreview()
  page.source.value.bodyTemplate='latest'
  await nextTick()
  const pendingSecond=page.refreshPreview()
  second.resolve(response({htmlBody:'latest'}))
  await pendingSecond
  first.resolve(response({htmlBody:'stale'}))
  await pendingFirst
  assert.equal(calls[0].signal.aborted,true)
  assert.equal(page.preview.value.htmlBody,'latest')
  page.dispose()
})

test('unmount cancels detail loading and discards late responses', async () => {
  const pending=deferred()
  let signal
  const page=createPage(config => {signal=config.signal;return pending.promise})
  const loading=page.load()
  page.dispose()
  pending.resolve(response(initial))
  await loading
  assert.equal(signal.aborted,true)
  assert.equal(page.detail.value,null)
})
