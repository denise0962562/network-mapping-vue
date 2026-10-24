import { computed, watch } from 'vue'
import { createI18n } from 'vue-i18n'
import english from './en.json' with { type: 'json' }
import { localeCookie, preferredLocale, readLocaleCookie, safeCookie, SUPPORTED_LOCALES } from './locale.js'

// Source text is retained during migration so code reviews can compare wording.
// Numeric internal keys avoid treating punctuation in source text as a key path.
const keys = new Map()
const originalLabels = new Map()
const messages = { 'zh-CN': {}, en: {} }
for (const [index, [source, translation]] of Object.entries(english).entries()) {
  const key = `ui${index}`
  keys.set(source, key)
  originalLabels.set(translation, originalLabels.has(translation) ? null : source)
  // Message functions preserve literal @, | and braces in examples and labels.
  messages['zh-CN'][key] = () => source
  messages.en[key] = () => translation
}

const documentObject = typeof document === 'undefined' ? null : document
const navigatorObject = typeof navigator === 'undefined' ? {} : navigator
export const i18n = createI18n({
  legacy: false,
  locale: preferredLocale(safeCookie(documentObject), navigatorObject),
  fallbackLocale: 'en',
  messages,
  missingWarn: false,
  fallbackWarn: false,
})
export const locale = computed(() => i18n.global.locale.value)

export function tr(source, values = []) {
  const key = keys.get(source)
  // Reading locale also tracks translations in computed labels and charts.
  const text = key ? i18n.global.t(key) : source
  return String(text).replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index] ?? '') : match)
}

// Cached toast/validation text can outlive a language change. Use this only for
// UI messages, never for evidence, article text, names or editable user content.
export function uiText(value) {
  return tr(originalLabels.get(value) || value)
}

let lastCookie = readLocaleCookie(safeCookie(documentObject))
let manualInMemory = false
export function setLocale(language) {
  if (!SUPPORTED_LOCALES.includes(language)) return false
  i18n.global.locale.value = language
  manualInMemory = true
  try { documentObject.cookie = localeCookie(language, documentObject.location.protocol) } catch { /* Keep the current tab usable without cookies. */ }
  lastCookie = readLocaleCookie(safeCookie(documentObject))
  return lastCookie === language
}

export function syncLocale(event) {
  const saved = readLocaleCookie(safeCookie(documentObject))
  if (saved !== lastCookie || (event?.type === 'languagechange' && !saved && !manualInMemory)) {
    lastCookie = saved
    manualInMemory = false
    i18n.global.locale.value = preferredLocale(safeCookie(documentObject), navigatorObject)
  }
}

if (documentObject) {
  watch(locale, (language) => { documentObject.documentElement.lang = language }, { immediate: true, flush: 'sync' })
  window.addEventListener('focus', syncLocale)
  window.addEventListener('pageshow', syncLocale)
  window.addEventListener('languagechange', syncLocale)
  documentObject.addEventListener?.('visibilitychange', () => {
    if (documentObject.visibilityState === 'visible') syncLocale()
  })
  window.cookieStore?.addEventListener('change', syncLocale)
}
