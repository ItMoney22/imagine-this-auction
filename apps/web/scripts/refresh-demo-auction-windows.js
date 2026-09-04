/**
 * Re-open the seeded demo auction windows so the site shows an actually-live
 * sale. The seed data was generated in April 2026 and its start/end times are
 * long past, which leaves the auction flagged `live` with a window that closed
 * months ago -- nothing is biddable.
 *
 * Prints the original timestamps before writing so the change is reversible.
 *
 *   node scripts/refresh-demo-auction-windows.js
 */
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local', quiet: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const HOUR = 3600e3
const DAY = 24 * HOUR

async function main() {
  const { data: auctions, error: readErr } = await supabase
    .from('auctions')
    .select('id, title, status, starts_at, ends_at')

  if (readErr) {
    console.error('Failed to read auctions:', readErr.message)
    process.exit(1)
  }

  console.log('=== ORIGINAL VALUES (keep these for rollback) ===')
  for (const a of auctions) {
    console.log(`${a.id}  ${a.status.padEnd(10)}  ${a.starts_at}  ${a.ends_at}  ${a.title}`)
  }

  const now = Date.now()
  const live = auctions.find((a) => a.status === 'live')
  const scheduled = auctions.find((a) => a.status === 'scheduled')

  if (live) {
    const { error } = await supabase
      .from('auctions')
      .update({
        starts_at: new Date(now - 2 * HOUR).toISOString(),
        ends_at: new Date(now + 14 * DAY).toISOString(),
      })
      .eq('id', live.id)
    console.log('\nlive auction window ->', error ? `ERROR ${error.message}` : 'now-2h .. now+14d')
  } else {
    console.log('\nNo auction with status=live found.')
  }

  if (scheduled) {
    const { error } = await supabase
      .from('auctions')
      .update({
        starts_at: new Date(now + 3 * DAY).toISOString(),
        ends_at: new Date(now + 10 * DAY).toISOString(),
      })
      .eq('id', scheduled.id)
    console.log('scheduled auction window ->', error ? `ERROR ${error.message}` : 'now+3d .. now+10d')
  } else {
    console.log('No auction with status=scheduled found.')
  }

  const { data: after } = await supabase
    .from('auctions')
    .select('id, title, status, starts_at, ends_at')

  console.log('\n=== AFTER ===')
  for (const a of after) {
    const inWindow =
      new Date(a.starts_at).getTime() <= Date.now() &&
      new Date(a.ends_at).getTime() > Date.now()
    console.log(
      `[${a.status}] in-window=${inWindow}  ${a.starts_at} -> ${a.ends_at}  ${a.title}`
    )
  }
}

main()
