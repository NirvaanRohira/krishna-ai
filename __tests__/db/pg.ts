// Boots a real Postgres (PGlite, Postgres compiled to WASM) with the bits of Supabase our
// migrations depend on: the auth schema, auth.uid()/auth.jwt(), and the API roles. Then
// applies every migration in order — exactly what `supabase db push` does.
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite/vector'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`

export const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations')

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { vector } })
  await db.exec(SUPABASE_STUBS)
  for (const f of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    try {
      await db.exec(sql)
    } catch (err) {
      throw new Error(`Migration ${f} failed: ${(err as Error).message}`)
    }
  }
  return db
}

/** Run `fn` as a signed-in user (role authenticated, auth.uid() = userId), like PostgREST does. */
export async function asUser<T>(db: PGlite, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${userId ? 'authenticated' : 'anon'}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ''])
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  }
}
