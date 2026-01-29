const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkDatabase() {
  console.log('🔍 Checking database connection and data...')

  try {
    // Check auctions table
    const { data: auctions, error: auctionsError } = await supabase
      .from('auctions')
      .select('*')
      .limit(5)

    if (auctionsError) {
      console.log('❌ Error fetching auctions:', auctionsError.message)
    } else {
      console.log('📊 Auctions found:', auctions.length)
      if (auctions.length > 0) {
        console.log('First auction:', auctions[0])
      }
    }

    // Check auctioneers table
    const { data: auctioneers, error: auctioneersError } = await supabase
      .from('auctioneers')
      .select('*')
      .limit(5)

    if (auctioneersError) {
      console.log('❌ Error fetching auctioneers:', auctioneersError.message)
    } else {
      console.log('🏢 Auctioneers found:', auctioneers.length)
      if (auctioneers.length > 0) {
        console.log('First auctioneer:', auctioneers[0])
      }
    }

    // Check the specific query used by the app
    const { data: liveAuctions, error: liveError } = await supabase
      .from('auctions')
      .select(`
        *,
        auctioneers (
          company_name,
          id
        ),
        lots (count)
      `)
      .eq('status', 'live')
      .eq('auctioneers.is_approved', true)

    if (liveError) {
      console.log('❌ Error with live auctions query:', liveError.message)
    } else {
      console.log('🎪 Live auctions with approved auctioneers:', liveAuctions.length)
      if (liveAuctions.length > 0) {
        console.log('First live auction:', liveAuctions[0])
      }
    }

  } catch (error) {
    console.error('💥 Database check failed:', error.message)
  }
}

checkDatabase()