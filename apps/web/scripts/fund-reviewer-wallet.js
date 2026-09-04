/**
 * Top up the payment-processor review account's ITC wallet.
 *
 * The initial 5,000 ITC grant was below the live auction's cheapest entry bid
 * (8,000), so the reviewer could log in but not actually place a bid. This
 * raises the balance to a level that clears the entry bid plus buyer premium.
 *
 *   node scripts/fund-reviewer-wallet.js
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

const REVIEWER_ID = process.env.REVIEWER_ID || '043d7c59-d035-4fbb-b48f-72e5bba56831'
const TOPUP = Number(process.env.REVIEWER_TOPUP || 45000)

async function main() {
  const { data: auction } = await supabase
    .from('auctions')
    .select('title, buyer_premium_percent, anti_sniping_seconds')
    .eq('status', 'live')
    .single()

  if (auction) {
    console.log(
      `live auction: ${auction.title} | buyer premium ${auction.buyer_premium_percent}% | anti-snipe ${auction.anti_sniping_seconds}s`
    )
  }

  const { data: before, error: beforeErr } = await supabase.rpc('get_wallet_balance', {
    user_uuid: REVIEWER_ID,
  })
  if (beforeErr) {
    console.error('Failed to read balance:', beforeErr.message)
    process.exit(1)
  }
  console.log('balance before:', before)

  const { error } = await supabase.rpc('add_wallet_credits', {
    user_uuid: REVIEWER_ID,
    credit_amount: TOPUP,
    provider_event_identifier: `reviewer-topup-${Date.now()}`,
    purchase_description: 'Payment processor review account top-up',
  })
  if (error) {
    console.error('Top-up failed:', error.message)
    process.exit(1)
  }

  const { data: after } = await supabase.rpc('get_wallet_balance', { user_uuid: REVIEWER_ID })
  console.log('balance after:', after)

  if (auction) {
    const cheapestEntryBid = 8000
    const withPremium = Math.round(
      cheapestEntryBid * (1 + auction.buyer_premium_percent / 100)
    )
    console.log(
      `cheapest lot ${cheapestEntryBid} + ${auction.buyer_premium_percent}% premium = ${withPremium} -> affordable: ${withPremium <= after}`
    )
  }
}

main()
