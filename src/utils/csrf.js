export function getCookieValue(name) {
  const cookieString = document.cookie || ''
  const cookies = cookieString.split(';')

  for (const cookie of cookies) {
    const trimmed = cookie.trim()
    if (!trimmed) continue

    const separatorIndex = trimmed.indexOf('=')
    const key = separatorIndex >= 0 ? trimmed.slice(0, separatorIndex) : trimmed
    if (key !== name) continue

    const rawValue = separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : ''
    return decodeURIComponent(rawValue)
  }

  return ''
}

export function expireCookie(name) {
  document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/`
}
