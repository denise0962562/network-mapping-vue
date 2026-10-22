<script setup>
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'

const props = defineProps({ text: { type: String, default: '' }, animate: Boolean })
const settled = ref(''), glyphs = shallowRef([])
const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
let previous = '', sequence = 0, timer

function finish() {
  clearTimeout(timer)
  settled.value = props.text
  glyphs.value = []
}

function settle() {
  clearTimeout(timer)
  const now = performance.now()
  const remaining = [...glyphs.value]
  while (remaining.length && remaining[0].until <= now) settled.value += remaining.shift().text
  glyphs.value = remaining
  if (remaining.length) timer = setTimeout(settle, Math.max(1, remaining[0].until - now))
}

watch(() => [props.text, props.animate], ([text, animate]) => {
  if (!animate || motion.matches || !text.startsWith(previous)) {
    finish()
  } else if (text !== previous) {
    const now = performance.now()
    // Keep only the fresh ink as spans; long replies become ordinary text.
    const added = Array.from(segmenter.segment(text.slice(previous.length)), part => part.segment)
    const overflow = Math.max(0, glyphs.value.length + added.length - 180)
    const pending = [...glyphs.value]
    settled.value += pending.splice(0, overflow).map(glyph => glyph.text).join('')
    const skipped = Math.max(0, overflow - glyphs.value.length)
    settled.value += added.slice(0, skipped).join('')
    glyphs.value = [...pending, ...added.slice(skipped).map((text, index) => {
      const delay = Math.min(index * 18, 240)
      return { id: sequence++, text, delay, until: now + delay + 680 }
    })]
    settle()
  }
  previous = text
}, { immediate: true })

function motionChanged() { if (motion.matches) finish() }
motion.addEventListener('change', motionChanged)
onBeforeUnmount(() => {
  clearTimeout(timer)
  motion.removeEventListener('change', motionChanged)
})
</script>

<template>
  <span>{{ settled }}<span v-for="glyph in glyphs" :key="glyph.id" class="ink-glyph" :style="{ animationDelay: `${glyph.delay}ms` }">{{ glyph.text }}</span></span>
</template>

<style scoped>
.ink-glyph {
  animation: ink-reveal 680ms ease-out both;
}

@keyframes ink-reveal {
  0% { opacity: 0; text-shadow: 0 0 8px currentColor; }
  28% { opacity: 0.35; text-shadow: 0 0 5px currentColor, 0 0 2px currentColor; }
  65% { opacity: 0.8; text-shadow: 0 0 1px currentColor; }
  100% { opacity: 1; text-shadow: none; }
}

@media (prefers-reduced-motion: reduce) {
  .ink-glyph { animation: none; }
}
</style>
