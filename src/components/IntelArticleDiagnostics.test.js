import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

test('article failure details show stage and correlation ID, escape text, and explain legacy records', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../../', import.meta.url)), plugins: [vue()], server: { middlewareMode: true, hmr: false }, logLevel: 'silent' })
  try {
    const { default: component } = await server.ssrLoadModule('/src/components/IntelArticleDiagnostics.vue')
    const render = diagnostic => renderToString(createSSRApp(component, { articleId: 'article-fixture', diagnostic }))
    const html = await render({ stage: 'ai_request', http_status: 503, host: '<img src=x onerror=alert(1)>', authorization: 'Bearer secret' })
    assert.match(html, /请求 AI 接口/)
    assert.match(html, /503/)
    assert.match(html, /article-fixture/)
    assert.match(html, /IntelArticleExtractionFailed/)
    assert.match(html, /&lt;img/)
    assert.doesNotMatch(html, /<img|Bearer secret/)
    assert.match(await render(null), /历史失败未记录详细诊断/)
    const missingBody = await render({ stage: 'article_parse', selector: '.article-body', reason: 'selector_not_found' })
    assert.match(missingBody, /解析文章正文/)
    assert.match(missingBody, /\.article-body/)
  } finally { await server.close() }
})
