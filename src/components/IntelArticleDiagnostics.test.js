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
    const { i18n } = await server.ssrLoadModule('/src/i18n/index.js')
    i18n.global.locale.value = 'zh-CN'
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
    const invalidJson = await render({ stage: 'ai_validate', finish_reason: 'stop', content_bytes: 128, content_format: 'markdown_fence', reason: 'markdown_fence', json_error_category: 'syntax', json_line: 2, json_column: 11, content: 'private-response' })
    assert.match(invalidJson, /模型回复字节数/)
    assert.match(invalidJson, /代码围栏/)
    assert.match(invalidJson, /正常结束/)
    assert.match(invalidJson, /JSON 错误行/)
    assert.match(invalidJson, /语法错误/)
    assert.doesNotMatch(invalidJson, /private-response/)
    const evidence = await render({ reason: 'evidence_context_record_heading_required', expected_context_block_id: 29, correction_method: 'record_heading', raw: 'private-evidence' })
    assert.match(evidence, /应引用该 IOC 所属记录的标题/)
    assert.match(evidence, /预期上下文标题块/)
    assert.match(evidence, /根据所属记录标题重新定位/)
    assert.doesNotMatch(evidence, /private-evidence/)
    const unit = await render({ reason: 'evidence_unit_not_found' })
    assert.match(unit, /所选原文证据单元不存在或不适用于该 IOC 类型/)
  } finally { await server.close() }
})
