export const LOCALE_COOKIE = 'network_mapping_locale'
export const SUPPORTED_LOCALES = ['zh-CN', 'en']
export const COOKIE_MAX_AGE = 365 * 24 * 60 * 60

export function browserLocale(navigatorObject = {}) {
  const language = navigatorObject.languages?.[0] || navigatorObject.language || ''
  return /^zh(?:-|$)/i.test(language) ? 'zh-CN' : 'en'
}

export function readLocaleCookie(cookie = '') {
  for (const part of cookie.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name !== LOCALE_COOKIE) continue
    try {
      const locale = decodeURIComponent(value.join('='))
      return SUPPORTED_LOCALES.includes(locale) ? locale : null
    } catch { return null }
  }
  return null
}

export function preferredLocale(cookie, navigatorObject) {
  return readLocaleCookie(cookie) || browserLocale(navigatorObject)
}

export function localeCookie(locale, protocol = 'https:') {
  if (!SUPPORTED_LOCALES.includes(locale)) throw new RangeError('Unsupported locale')
  return `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${protocol === 'https:' ? '; Secure' : ''}`
}

export function safeCookie(documentObject) {
  try { return documentObject?.cookie || '' } catch { return '' }
}
