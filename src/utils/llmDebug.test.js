import assert from 'node:assert/strict'
import test from 'node:test'
import { debugParameterForm, debugParameterPayload, debugParameterSummary } from './llmDebug.js'

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
