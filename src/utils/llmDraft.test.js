import test from 'node:test'
import assert from 'node:assert/strict'
import { readDraft, writeDraft, draftLifetime, historyParameters } from './llmDraft.js'
function storage() {
  const map = new Map()
  return { map, getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }
}
test('drafts survive refresh for seven days without extending their lifetime on reads', () => {
  const store = storage()
  assert.equal(writeDraft(store, 1, 'unfinished\nmessage', 1000), true)
  assert.equal(readDraft(store, 1, 2000), 'unfinished\nmessage')
  assert.equal(readDraft(store, 2, 2000), '')
  assert.equal(readDraft(store, 1, 1000 + draftLifetime - 1), 'unfinished\nmessage')
  assert.equal(readDraft(store, 1, 1000 + draftLifetime), '')
  assert.equal(store.map.size, 0)
})
test('sending or deleting clears a draft immediately and storage failures never break typing', () => {
  const store = storage()
  writeDraft(store, 1, 'secret', 1000)
  writeDraft(store, 1, '', 1001)
  assert.equal(store.map.size, 0)
  store.map.set('network-mapping:llm-draft:v1:1', 'broken-json')
  assert.equal(readDraft(store, 1), '')
  assert.equal(store.map.size, 0)
  const denied = { getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') }, removeItem() { throw new Error('denied') } }
  assert.equal(readDraft(denied, 1), '')
  assert.equal(writeDraft(denied, 1, 'keep in memory'), false)
})
test('history restores explicit sampling, stream and token fields including zero values', () => {
  const p = historyParameters({ temperature: 0, top_p: 0, stream: false, max_output_tokens: 512, token_limit_field: 'max_completion_tokens' })
  assert.equal(p.temperature, 0); assert.equal(p.top_p, 0); assert.equal(p.stream, 'off')
  assert.equal(p.token_limit_field, 'max_completion_tokens')
  assert.equal(historyParameters({ token_limit_field: 'max_output_tokens' }, 'responses').token_limit_field, 'inherit')
})
