import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

test('verified evidence renders separate quotes and rejection summaries expose only ordinal and reason', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../../', import.meta.url)), plugins: [vue()], server: { middlewareMode: true, hmr: false }, logLevel: 'silent' })
  try {
    const { i18n } = await server.ssrLoadModule('/src/i18n/index.js')
    i18n.global.locale.value = 'zh-CN'
    const { default: quote } = await server.ssrLoadModule('/src/components/IntelEvidenceQuote.vue')
    const html = await renderToString(createSSRApp(quote, { locatable: true, payload: { evidence_spans: [{ block_id: 1, kind: 'context', quote: '恶意 DNS' }, { block_id: 2, kind: 'ioc', quote: '<script>192[.]0[.]2[.]1</script>' }] } }))
    assert.match(html, /上下文原文/)
    assert.match(html, /IOC 原文/)
    assert.match(html, /定位原文/)
    assert.match(html, /&lt;script&gt;/)
    assert.doesNotMatch(html, /<script>/)
    const old = await renderToString(createSSRApp(quote, { payload: { evidence: '旧版连续原文证据' } }))
    assert.match(old, /旧版连续原文证据/)
    assert.doesNotMatch(old, /定位原文/)
    const { default: validation } = await server.ssrLoadModule('/src/components/IntelArticleValidation.vue')
    const details = await renderToString(createSSRApp(validation, { report: { rejected: 50, rejection_samples: [{ record: 2, reason: 'evidence_not_in_body', raw: 'PRIVATE_AI_VALUE' }, { record: 3, reason: 'evidence_context_scope_mismatch' }] } }))
    assert.match(details, /50 条未保留/)
    assert.match(details, /第 2 条/)
    assert.match(details, /不是正文中的连续原文/)
    assert.match(details, /不属于同一列表范围/)
    assert.match(details, /展示 2 条拒绝样本/)
    assert.doesNotMatch(details, /PRIVATE_AI_VALUE/)
    const corrected = await renderToString(createSSRApp(validation, { report: {
      direct_accepted: 2, corrected: 46, rejected: 1,
      correction_samples: [{ record: 1, reason: 'evidence_context_record_field_unsupported', expected_context_block_id: 29, raw: 'PRIVATE_CORRECTION_VALUE' }],
      rejection_samples: [{ record: 49, reason: 'evidence_context_record_mismatch', context_block_id: 29, ioc_block_id: 35, ioc_scope_block_id: 34 }],
    } }))
    assert.match(corrected, /已纠正 46 条/)
    assert.match(corrected, /直接通过 2 条，纠正后通过 46 条，未保留 1 条/)
    assert.match(corrected, /上下文字段不能支持/)
    assert.match(corrected, /另一条资产记录/)
    assert.match(corrected, /标题块 29/)
    assert.match(corrected, /展示 1 条纠正样本/)
    assert.match(corrected, /不代表已完成人工审核/)
    assert.doesNotMatch(corrected, /PRIVATE_CORRECTION_VALUE/)
    const recovered = await renderToString(createSSRApp(validation, { report: { corrected: 46, direct_accepted: 0, rejected: 0 } }))
    assert.match(recovered, /已纠正 46 条/)
    assert.match(recovered, /0 条未保留/)
    const noReport = await renderToString(createSSRApp(validation, { report: null }))
    assert.doesNotMatch(noReport, /证据校验详情/)
  } finally { await server.close() }
})
