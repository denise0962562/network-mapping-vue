<script setup>
import { computed } from 'vue'
import { autocompletion } from '@codemirror/autocomplete'
import { html } from '@codemirror/lang-html'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { EditorView } from 'codemirror'
import { Codemirror } from 'vue-codemirror'
import { useTheme } from '@/composables/useTheme'

const model = defineModel({ type: String, default: '' })
const props = defineProps({
  variables: { type: Array, default: () => [] },
  language: { type: String, default: 'html' },
  placeholder: { type: String, default: '输入模板内容和 Tera 语法' },
  disabled: Boolean,
})
const emit = defineEmits(['ready','focus'])
const { isDark } = useTheme()
function completionSource(context) {
  const word = context.matchBefore(/[A-Za-z_][\w.]*/)
  if (!word && !context.explicit) return null
  return {
    from: word?.from ?? context.pos,
    options: props.variables.map((variable) => ({
      label: variable.key,
      type: 'variable',
      detail: `${variable.label} · ${variable.example}`,
      apply: variable.key
    }))
  }
}

const variableAutocomplete = autocompletion({ override: [completionSource] })
const htmlExtension = html()
const editorTheme = computed(() => [
  EditorView.theme({
    '&': { height: '480px', backgroundColor: 'var(--color-base-100)', color: 'var(--color-base-content)' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-gutters': { backgroundColor: 'var(--color-base-200)', color: 'var(--color-base-content)', borderColor: 'var(--color-base-300)' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--color-base-200)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-base-content)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in oklab, var(--color-primary) 25%, transparent)' },
    '.cm-tooltip, .cm-panels': { backgroundColor: 'var(--color-base-100)', color: 'var(--color-base-content)', borderColor: 'var(--color-base-300)' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--color-base-300)', color: 'var(--color-base-content)' },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--color-base-300)' }
  }, { dark: isDark.value }),
  syntaxHighlighting(HighlightStyle.define([
    { tag: tags.tagName, color: isDark.value ? '#93c5fd' : '#0550ae' },
    { tag: tags.attributeName, color: isDark.value ? '#c4b5fd' : '#8250df' },
    { tag: [tags.string, tags.attributeValue], color: isDark.value ? '#86efac' : '#116329' },
    { tag: tags.comment, color: isDark.value ? '#94a3b8' : '#6b7280' },
    { tag: [tags.angleBracket, tags.punctuation], color: isDark.value ? '#cbd5e1' : '#475569' }
  ]))
])
const extensions = computed(() => [...(props.language === 'html' ? [htmlExtension] : []), variableAutocomplete, ...editorTheme.value])

</script>
<template>
  <Codemirror v-model="model" :extensions="extensions" :disabled="disabled" :indent-with-tab="true" :tab-size="2" :placeholder="placeholder" @ready="emit('ready',$event)" @focus="emit('focus',$event)" />
</template>
