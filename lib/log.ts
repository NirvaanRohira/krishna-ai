// Structured logs: one JSON object per line, which Cloud Run / Cloud Logging parse into
// searchable fields (severity drives alerting). Never pass message content, emails or tokens.
type Level = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'
type Fields = Record<string, string | number | boolean | null | undefined>

function emit(severity: Level, area: string, msg: string, fields: Fields = {}, err?: unknown) {
  if (process.env.NODE_ENV === 'test') return
  const entry: Record<string, unknown> = { severity, area, message: msg, time: new Date().toISOString(), ...fields }
  if (err instanceof Error) entry.error = { name: err.name, message: err.message, stack: err.stack }
  else if (err !== undefined) entry.error = String(err)
  const line = JSON.stringify(entry)
  if (severity === 'ERROR') console.error(line)
  else if (severity === 'WARNING') console.warn(line)
  else console.log(line)
}

export const log = {
  info: (area: string, msg: string, fields?: Fields) => emit('INFO', area, msg, fields),
  warn: (area: string, msg: string, fields?: Fields, err?: unknown) => emit('WARNING', area, msg, fields, err),
  error: (area: string, msg: string, fields?: Fields, err?: unknown) => {
    emit('ERROR', area, msg, fields, err)
    if (process.env.SENTRY_DSN && err !== undefined) {
      import('@sentry/node')
        .then((Sentry) => Sentry.captureException(err, { tags: { area }, extra: fields }))
        .catch(() => {})
    }
  },
}
