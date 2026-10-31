// Deploy-order safety: the app must keep working if new code ships before its migration
// has been applied (expand → migrate → contract). These detect "that column/function
// doesn't exist yet" errors from PostgREST/Postgres so callers can fall back.
type PgErr = { code?: string; message?: string } | null | undefined

export function isMissingColumn(err: PgErr): boolean {
  return !!err && (err.code === '42703' || err.code === 'PGRST204' || /column .* does not exist|Could not find the .* column/i.test(err.message ?? ''))
}

export function isMissingFunction(err: PgErr): boolean {
  return !!err && (err.code === 'PGRST202' || err.code === '42883' || /Could not find the function|function .* does not exist/i.test(err.message ?? ''))
}
