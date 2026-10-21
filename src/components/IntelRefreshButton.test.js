import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { reactive, ref, watch } from 'vue'
import { parse } from 'vue/compiler-sfc'

const { descriptor } = parse(readFileSync(new URL('./IntelRefreshButton.vue', import.meta.url), 'utf8'))
const script = descriptor.scriptSetup.content.replace(/^import .*$/gm, '')

function button() {
  const props = reactive({ loading: false }), timers = new Map()
  let now = 0, id = 0, dispose
  const { visible } = vm.runInNewContext(`${script}\n;({ visible })`, {
    ref, watch, defineProps: () => props, defineEmits: () => () => {},
    Date: { now: () => now },
    setTimeout: (fn, delay) => { timers.set(++id, { fn, at: now + delay }); return id },
    clearTimeout: key => timers.delete(key), onBeforeUnmount: fn => { dispose = fn },
  })
  function advance(ms) {
    const end = now + ms
    for (;;) {
      const next = [...timers].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      now = next[1].at; timers.delete(next[0]); next[1].fn()
    }
    now = end
  }
  return { props, visible, timers, advance, dispose: () => dispose() }
}

test('fast refreshes never flash the loading indicator', () => {
  const b = button()
  b.props.loading = true; b.advance(100); b.props.loading = false; b.advance(1000)
  assert.equal(b.visible.value, false)
  assert.equal(b.timers.size, 0)
  b.dispose()
})

test('slow refreshes show the indicator for at least 400ms without delaying data loading', () => {
  const b = button()
  b.props.loading = true; b.advance(149)
  assert.equal(b.visible.value, false)
  b.advance(1)
  assert.equal(b.visible.value, true)
  b.advance(50); b.props.loading = false
  assert.equal(b.props.loading, false)
  b.advance(349)
  assert.equal(b.visible.value, true)
  b.advance(1)
  assert.equal(b.visible.value, false)
  b.dispose()
})

test('a new refresh cancels a pending hide and unmount clears pending timers', () => {
  const b = button()
  b.props.loading = true; b.advance(150); b.props.loading = false; b.advance(100)
  b.props.loading = true; b.advance(1000)
  assert.equal(b.visible.value, true)
  b.props.loading = false; b.advance(0)
  assert.equal(b.visible.value, false)
  b.props.loading = true; b.dispose(); b.advance(1000)
  assert.equal(b.visible.value, false)
  assert.equal(b.timers.size, 0)
})
