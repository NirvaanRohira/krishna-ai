import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Service-role client: BYPASSES RLS. Least privilege — used only by:
//   - app/api/account/delete (removing the auth user)
//   - app/api/cron (aggregate usage totals, retention purge)
//   - app/api/payments/* (record orders, settle verified payments, webhook)
// Never import this from a client component or a user-facing data path.
export function createAdminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
