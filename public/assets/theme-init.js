// Served with the other frontend assets and loaded before the first paint.
;(function () {
  const storageKey = 'network_mapping_theme'
  const listeners = new Set()
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const normalize = (value) => ['light', 'dark', 'system'].includes(value) ? value : 'system'
  let preference = 'system'
  try {
    preference = normalize(window.localStorage.getItem(storageKey))
  } catch {
    // The theme still works when browser storage is unavailable.
  }

  function getTheme() {
    return preference === 'system' ? (media.matches ? 'dark' : 'light') : preference
  }

  function apply() {
    const theme = getTheme()
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    for (const listener of listeners) listener({ preference, theme })
  }

  window.networkMappingTheme = {
    getPreference: () => preference,
    getTheme,
    setPreference(value) {
      preference = normalize(value)
      try {
        window.localStorage.setItem(storageKey, preference)
      } catch {
        // Keep this page's choice even when it cannot be persisted.
      }
      apply()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }

  media.addEventListener('change', () => {
    if (preference === 'system') apply()
  })
  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey && event.key !== null) return
    // Ignore sessionStorage events, including clear(), from other documents.
    try {
      if (event.storageArea && event.storageArea !== window.localStorage) return
    } catch {
      return
    }
    preference = normalize(event.newValue)
    apply()
  })
  apply()
})()
