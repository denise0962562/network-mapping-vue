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
    const { default: component } = await server.ssrLoadModule('/src/components/ServiceLabel.vue')
    const html = await renderToString(createSSRApp(component, { service: 'vnc', data: { schema_version: 2, evidence: [{module:'vnc', result:{ protocol_version:'<img src=x>' }}] } }))
    assert.match(html, /badge badge-outline/)
    assert.match(html, /&lt;img src=x&gt;/)
    assert.doesNotMatch(html, /<img/)
    assert.match(html, /未进行认证/)
    const unknown = await renderToString(createSSRApp(component, {service:'ssh'}))
    assert.match(unknown, /ssh/)
  } finally { await server.close() }
})
