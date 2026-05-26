/**
 * Poll Supabase every 3s and print any profile fields that have been filled in.
 * Run: npx tsx --env-file=.env.local scripts/watch_profiles.ts
 * Stop: Ctrl+C
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

let last = ''

async function poll() {
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('user_id, life_context, last_session_summary, previous_guidance, updated_at')
    .not('life_context', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(5)

  const { data: spiritual } = await supabase
    .from('user_spiritual_profile')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(5)

  const snapshot = JSON.stringify({ profiles, spiritual })
  if (snapshot !== last) {
    last = snapshot
    console.clear()
    console.log('=== Dharmic Profile Watcher ===', new Date().toLocaleTimeString())
    console.log('\n── user_profiles (with life_context) ──')
    console.log(JSON.stringify(profiles, null, 2))
    console.log('\n── user_spiritual_profile ──')
    console.log(JSON.stringify(spiritual, null, 2))
  }
}

console.log('Watching for profile updates... (Ctrl+C to stop)')
poll()
setInterval(poll, 3000)
