import assert from 'node:assert/strict'
import test from 'node:test'
import { debugParameterForm, debugParameterPayload, debugParameterSummary, debugOutputRate, debugCacheUsage } from './llmDebug.js'

test('empty controls inherit settings and zero-valued sampling overrides are preserved', () => {
  assert.deepEqual(debugParameterPayload(debugParameterForm()), {})
  const form = { ...debugParameterForm(), reasoning_effort: 'default', temperature: '0', top_p: 0, max_output_tokens: '1', timeout_seconds: '1800', stream: 'off', token_limit_field: 'max_completion_tokens' }
  assert.deepEqual(debugParameterPayload(form), { reasoning_effort: 'default', temperature: 0, top_p: 0, max_output_tokens: 1, timeout_seconds: 1800, stream: false, token_limit_field: 'max_completion_tokens' })
  assert.equal(debugParameterPayload(form, 'responses').token_limit_field, undefined)
  assert.match(debugParameterSummary({ reasoning_effort: 'none', max_output_tokens: 128, temperature: 0, top_p: 0, timeout_seconds: 30, stream: false }), /关闭推理.*128 token.*温度 0.*Top P 0.*30 秒.*流式关闭/)
})

test('invalid controls cannot be silently dropped or sent as coerced null values', () => {
  for (const invalid of [
    { temperature: 2.1 }, { temperature: 'NaN' }, { temperature: Infinity }, { top_p: -0.1 },
    { max_output_tokens: 0 }, { max_output_tokens: 393217 }, { max_output_tokens: 1.5 },
    { timeout_seconds: 0 }, { timeout_seconds: 1801 }, { timeout_seconds: true },
    { reasoning_effort: 'unknown' }, { stream: 'unknown' }, { token_limit_field: 'unknown' },
  ]) assert.throws(() => debugParameterPayload({ ...debugParameterForm(), ...invalid }))
})

test('output speed uses actual output tokens over total elapsed time and keeps missing usage distinct from zero', () => {
  assert.equal(debugOutputRate({ output_tokens: 100 }, 2500), '40.0 token/s')
  assert.equal(debugOutputRate({ output_tokens: 0 }, 1000), '0.0 token/s')
  assert.equal(debugOutputRate({ output_tokens: 250, reasoning_tokens: 200 }, 5000), '50.0 token/s')
  for (const usage of [undefined, {}, { output_tokens: null }, { output_tokens: '100' }, { output_tokens: -1 }, { output_tokens: Infinity }]) assert.equal(debugOutputRate(usage, 1000), '—')
  for (const duration of [undefined, null, 0, -1, Infinity, NaN, '1000']) assert.equal(debugOutputRate({ output_tokens: 100 }, duration), '—')
})

test('cache hits use input token totals and distinguish no hit from missing or invalid usage', () => {
  assert.deepEqual(debugCacheUsage({ input_tokens: 1000, cached_input_tokens: 800 }), { tokens: '800 token', hitRate: '80.0%' })
  assert.deepEqual(debugCacheUsage({ input_tokens: 1000, cached_input_tokens: 0 }), { tokens: '0 token', hitRate: '0.0%' })
  assert.equal(debugCacheUsage({ input_tokens: 3, cached_input_tokens: 1 }).hitRate, '33.3%')
  assert.equal(debugCacheUsage({ input_tokens: 1000, cached_input_tokens: 1000 }).hitRate, '100.0%')
  for (const usage of [undefined, {}, { input_tokens: 1000 }, { input_tokens: 1000, cached_input_tokens: null }, { cached_input_tokens: -1 }, { cached_input_tokens: '100' }, { cached_input_tokens: Infinity }]) assert.deepEqual(debugCacheUsage(usage), { tokens: '—', hitRate: '—' })
  for (const input of [undefined, null, 0, -1, '1000', Infinity, 100]) assert.deepEqual(debugCacheUsage({ input_tokens: input, cached_input_tokens: 800 }), { tokens: '800 token', hitRate: '—' })
})
