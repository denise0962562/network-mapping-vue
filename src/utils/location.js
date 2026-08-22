function normalizedText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function formatLocation(item = {}) {
  const countryName = normalizedText(item.country_name)
  const countryCode = normalizedText(item.country_code)
  const country = countryName
    ? `${countryName}${countryCode ? ` (${countryCode})` : ''}`
    : countryCode

  return [country, normalizedText(item.region_name), normalizedText(item.city_name)]
    .filter(Boolean)
    .join(' · ') || '-'
}
