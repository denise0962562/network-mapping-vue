import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

test('native service labels keep protocol evidence escaped and do not infer login access', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../../', import.meta.url)), plugins: [vue()], resolve: { alias: { '@': fileURLToPath(new URL('../', import.meta.url)) } }, server: { middlewareMode: true, hmr: false }, logLevel: 'silent' })
  try {
    const { i18n } = await server.ssrLoadModule('/src/i18n/index.js')
    i18n.global.locale.value = 'zh-CN'
    const { default: component } = await server.ssrLoadModule('/src/components/ServiceLabel.vue')
    const html = await renderToString(createSSRApp(component, { service: 'vnc', data: { schema_version: 2, evidence: [{module:'vnc', result:{ protocol_version:'<img src=x>' }}] } }))
    assert.match(html, /badge badge-outline/)
    assert.match(html, /&lt;img src=x&gt;/)
    assert.equal(html.includes('<img'), false)
    assert.match(html, /未进行认证/)
    for(const [service,module,result,pattern] of [
      ['doh','doh',{path:'/dns-query',dns:{response_code:'REFUSED'}},/DNS over HTTPS/],
      ['mqtt','mqtt',{protocol_version:'5.0',connack_code:135,authentication_required:true},/需要认证/],
      ['enip','enip_udp',{vendor_id:1,product_name:'<script>alert(1)</script>'},/EtherNet\/IP UDP/],
      ['opcua_pubsub','opcua_pubsub',{confirmation:'uadp_variant_keyframe'},/不代表源端口开放/]
    ]) {const rendered=await renderToString(createSSRApp(component,{service,data:{schema_version:2,evidence:[{module,result}]}}));assert.match(rendered,pattern);assert.equal(rendered.includes('<script>'),false)}
    for (const [payload, escaped] of [
      ['<SCRIPT>alert(1)</SCRIPT>', '&lt;SCRIPT&gt;alert(1)&lt;/SCRIPT&gt;'],
      ['<ScRiPt type="text/javascript">alert(1)</ScRiPt>', '&lt;ScRiPt type=&quot;text/javascript&quot;&gt;alert(1)&lt;/ScRiPt&gt;'],
      ['<IMG src=x onerror=alert(1)>', '&lt;IMG src=x onerror=alert(1)&gt;']
    ]) {
      const rendered = await renderToString(createSSRApp(component, {service:'enip', data:{schema_version:2,evidence:[{module:'enip_udp',result:{product_name:payload}}]}}))
      assert.equal(rendered.includes(payload), false)
      assert.ok(rendered.includes(escaped))
    }
    const unknown = await renderToString(createSSRApp(component, {service:'ssh'}))
    assert.match(unknown, /ssh/)
  } finally { await server.close() }
})
