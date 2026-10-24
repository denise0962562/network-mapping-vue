import { locale } from './index.js'
import { formatDateTime as fixedDateTime, formatTime as fixedTime } from '../utils/systemTime.js'

export * from '../utils/systemTime.js'
// Only presentation uses the UI language. Calendar calculations and default
// formatters used by established CSV exports retain their original contract.
export const formatDateTime = (value, timezone) => fixedDateTime(value, timezone, locale.value)
export const formatTime = (value, timezone) => fixedTime(value, timezone, locale.value)
