import legacyPublicFields from './publicConfigFields.json' with { type: 'json' }

// New reports carry their release's public schema. The names-only fallback is
// for legacy server/scanner snapshots and comes from the tracked root configs.
export function deploymentConfigItems(report) {
  const fields = new Set(Array.isArray(report?.public_fields)
    ? report.public_fields
    : legacyPublicFields[report?.component] || [])
  return (report?.items || []).filter((item) =>
    fields.has(item.field) &&
    item.source !== 'database_seed' && item.source !== 'remote_override')
}
