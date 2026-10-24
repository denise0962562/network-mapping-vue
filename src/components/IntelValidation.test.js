import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

test('isolated source records show bounded diagnostics as plain text', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../../', import.meta.url)), plugins: [vue()], server: { middlewareMode: true, hmr: false }, logLevel: 'silent' })
  try {
    const { i18n } = await server.ssrLoadModule('/src/i18n/index.js')
    i18n.global.locale.value = 'zh-CN'
    const { default: component } = await server.ssrLoadModule('/src/components/IntelValidation.vue')
    const render = report => renderToString(createSSRApp(component, { report }))
    const html = await render({ rejected: 1, rejection_samples: [{ record: 7, external_id: '42', file: '<script>report.json', type: 'domain', value: '<img src=x onerror=alert(1)>', code: 'intel_invalid_domain' }] })
    assert.match(html, /已隔离 1 条/); assert.match(html, /7 \/ 42/)
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
    assert.match(html, /&lt;script&gt;report.json/)
    assert.doesNotMatch(html, /<img|<script|<a\s/)
    const bounded = await render({ rejected: 101, rejection_samples: Array.from({ length: 110 }, (_, i) => ({ external_id: String(i), type: 'domain', value: 'bad=value', code: 'intel_invalid_domain' })) })
    assert.equal((bounded.match(/<tr>/g) || []).length, 101)
    assert.match(bounded, /仅展示前 100 条/)
    assert.doesNotMatch(await render(null), /已隔离/)
    assert.doesNotMatch(await render({ rejected: 0 }), /已隔离/)
  } finally { await server.close() }
})
