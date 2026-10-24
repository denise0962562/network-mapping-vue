import { tr, i18n } from '../i18n/index.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { computed, ref } from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { intelError } from '../utils/threatIntel.js'
const { descriptor } = parse(readFileSync(new URL('./IntelArticleForm.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'manual-article' })
const source = compiled.scriptSetupAst.filter(n => n.type === 'ImportDeclaration').reverse().reduce((s,n) => s.slice(0,n.start)+s.slice(n.end),descriptor.scriptSetup.content)
function form(http) {
  let dispose; const events = []
  const page = localizedVm(`${source}\n;({submit,available,sourceId,title,url,body,error,notice,busy})`, { computed, ref, AbortController, http, intelError, defineProps: () => ({ sources: [{id:'a',revision:7,enabled:true,kind:'article',transport:'manual'}, {id:'wrong',enabled:true,kind:'json',transport:'https'}, {id:'disabled',enabled:false,kind:'article',transport:'manual'}] }), defineEmits: () => event => events.push(event), onBeforeUnmount: fn => {dispose=fn} })
  return {...page,events,dispose: () => dispose()}
}
test('article submission binds source revision and keeps all text for retry',async () => {
  const sent = []; let fail = true
  const p=form({post:async (...args) => {sent.push(args);if(fail)throw {response:{data:{code:'intel_revision_conflict'}}}}})
  assert.equal(p.available.value.length,1)
  p.sourceId.value='a';p.title.value=' Report ';p.url.value=' https://research.example/report ';p.body.value=' The report lists AS 64496 as malicious routing infrastructure. '
  await p.submit();assert.match(p.error.value,/刷新/);assert.match(p.body.value,/AS 64496/);assert.equal(p.events.length,0)
  assert.equal(sent[0][0],'/api/intel/articles');assert.equal(sent[0][1].expected_revision,7);assert.equal(sent[0][1].source_id,'a');assert.equal(sent[0][1].title,'Report')
  assert.ok(!Object.hasOwn(sent[0][1],'origin')&&!Object.hasOwn(sent[0][1],'approved'))
  fail=false;await p.submit();assert.equal(p.body.value,'');assert.equal(p.events[0],'saved');assert.match(p.notice.value,/人工审核/)
  p.dispose()
})
test('link-only requests send no fake snapshot and leaving aborts the request',async () => {
  let options,resolve
  const p=form({post:(_url,body,config) => {assert.equal(body.body,null);options=config;return new Promise(done=>{resolve=done})}})
  p.sourceId.value='a';p.title.value='Report';p.url.value='https://research.example/report'
  const pending=p.submit();p.dispose();assert.equal(options.signal.aborted,true);resolve({});await pending;assert.equal(p.events.length,0)
})

// Existing business fixtures select Chinese explicitly; locale behavior has its own tests.
function localizedVm(code, context, options) {
  i18n.global.locale.value = 'zh-CN'
  return vm.runInNewContext(code, { tr, ...context }, options)
}
