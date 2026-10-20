import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
test('ASN context is displayed separately from direct IP risk and safely renders classifications',async () => {
  const server=await createServer({configFile:false,root:fileURLToPath(new URL('../../',import.meta.url)),plugins:[vue()],server:{middlewareMode:true,hmr:false},logLevel:'silent'})
  try {
    const {default:component}=await server.ssrLoadModule('/src/components/IntelEvidence.vue')
    const render=intel=>renderToString(createSSRApp(component,{intel,label:'IP 情报'}))
    const hit={id:'asn',type:'asn',value:'AS64496',source_name:'Official report',payload:{attack_types:['bgp_hijacking','dns_response_tampering'],role:'route_hijacker',resource_owner:'<img src=x onerror=alert(1)>'}}
    const context={available:true,risk:'malicious',matches:[hit],expired_matches:[]}
    const html=await render({available:true,risk:null,matches:[],expired_matches:[],asn_context:context})
    assert.match(html,/所属 ASN：恶意报告/);assert.doesNotMatch(html,/IP 情报：恶意/)
    assert.match(html,/不表示此 IP 被报告直接列名/);assert.match(html,/BGP 路由劫持、DNS 应答篡改/)
    assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(html,/<img/)
    const both=await render({available:true,risk:'malicious',matches:[{...hit,id:'ip',type:'ip',value:'203.0.113.1'}],expired_matches:[],asn_context:context})
    assert.match(both,/IP 情报：恶意/);assert.match(both,/所属 ASN：恶意报告/)
    const old=await render({available:true,risk:null,matches:[],expired_matches:[],asn_context:{...context,risk:null,matches:[],expired_matches:[{...hit,expired:true}]}})
    assert.match(old,/所属 ASN：已过期/);assert.doesNotMatch(old,/所属 ASN：恶意报告/)
  } finally {await server.close()}
})
