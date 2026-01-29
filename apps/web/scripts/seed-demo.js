const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function seedData() {
  console.log('🌱 Starting to seed demo data...')

  try {
    // First, let's create the admin user
    console.log('👤 Creating admin user...')
    const { error: userError } = await supabase
      .from('users')
      .upsert({
        id: '11111111-1111-1111-1111-111111111111',
        email: 'admin@imaginethisauction.com',
        role: 'admin',
        first_name: 'Platform',
        last_name: 'Admin',
        is_approved: true
      })

    if (userError) {
      console.log('User might already exist:', userError.message)
    } else {
      console.log('✅ Admin user created successfully')
    }

    // Create auctioneer users
    console.log('🏢 Creating auctioneer users...')
    const { error: auctioneerUsersError } = await supabase
      .from('users')
      .upsert([
        {
          id: '22222222-2222-2222-2222-222222222222',
          email: 'heritage.auctions@example.com',
          role: 'auctioneer',
          first_name: 'Heritage',
          last_name: 'Auctions',
          is_approved: true
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          email: 'sothebys.demo@example.com',
          role: 'auctioneer',
          first_name: 'Sothebys',
          last_name: 'Demo',
          is_approved: true
        }
      ])

    if (auctioneerUsersError) {
      console.log('Auctioneer users might already exist:', auctioneerUsersError.message)
    } else {
      console.log('✅ Auctioneer users created successfully')
    }

    // Create bidder users
    console.log('🙋 Creating bidder users...')
    const { error: bidderUsersError } = await supabase
      .from('users')
      .upsert([
        {
          id: '44444444-4444-4444-4444-444444444444',
          email: 'alice.bidder@example.com',
          role: 'bidder',
          first_name: 'Alice',
          last_name: 'Johnson',
          is_approved: true
        },
        {
          id: '55555555-5555-5555-5555-555555555555',
          email: 'bob.collector@example.com',
          role: 'bidder',
          first_name: 'Bob',
          last_name: 'Smith',
          is_approved: true
        }
      ])

    if (bidderUsersError) {
      console.log('Bidder users might already exist:', bidderUsersError.message)
    } else {
      console.log('✅ Bidder users created successfully')
    }

    // Create auctioneer companies
    console.log('🏛️ Creating auctioneer companies...')
    const { error: auctioneersError } = await supabase
      .from('auctioneers')
      .upsert([
        {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          user_id: '22222222-2222-2222-2222-222222222222',
          company_name: 'Heritage Auctions',
          business_license: 'GA-HERITAGE-001',
          address_line1: '3500 Maple Avenue',
          city: 'Dallas',
          state: 'TX',
          zip_code: '75219',
          is_approved: true,
          approval_date: new Date().toISOString(),
          organization_name: 'Heritage Auctions',
          slug: 'heritage-auctions'
        },
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          user_id: '33333333-3333-3333-3333-333333333333',
          company_name: 'Sotheby\'s Demo',
          business_license: 'NY-SOTHEBYS-001',
          address_line1: '1334 York Avenue',
          city: 'New York',
          state: 'NY',
          zip_code: '10021',
          is_approved: true,
          approval_date: new Date().toISOString(),
          organization_name: 'Sotheby\'s Demo',
          slug: 'sothebys-demo'
        }
      ])

    if (auctioneersError) {
      console.log('Auctioneers might already exist:', auctioneersError.message)
    } else {
      console.log('✅ Auctioneer companies created successfully')
    }

    // Create demo auctions
    console.log('🎪 Creating demo auctions...')
    const now = new Date()
    const { error: auctionsError } = await supabase
      .from('auctions')
      .upsert([
        {
          id: 'live0001-1111-1111-1111-111111111111',
          auctioneer_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          title: 'Fine Art & Antiques',
          description: 'A curated selection of fine art, antiques, and decorative objects from private collections.',
          starts_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
          ends_at: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
          status: 'live',
          buyer_premium_percent: 10.00
        },
        {
          id: 'live0002-2222-2222-2222-222222222222',
          auctioneer_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          title: 'Modern & Contemporary Art',
          description: 'Contemporary paintings, sculptures, and mixed media works by emerging artists.',
          starts_at: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
          ends_at: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(), // 6 hours from now
          status: 'live',
          buyer_premium_percent: 12.00
        },
        {
          id: 'live0003-3333-3333-3333-333333333333',
          auctioneer_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          title: 'Luxury Watches & Jewelry',
          description: 'Vintage and modern timepieces from prestigious brands, plus fine jewelry.',
          starts_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(), // 30 min ago
          ends_at: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(), // 3 hours from now
          status: 'live',
          buyer_premium_percent: 8.00
        },
        {
          id: 'upcoming1-1111-1111-1111-111111111111',
          auctioneer_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          title: 'Asian Art & Ceramics',
          description: 'Rare Chinese porcelain, Japanese woodblock prints, and Southeast Asian sculptures.',
          starts_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // 1 day from now
          ends_at: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(), // 2 days from now
          status: 'scheduled',
          buyer_premium_percent: 10.00
        }
      ])

    if (auctionsError) {
      console.log('Auctions might already exist:', auctionsError.message)
    } else {
      console.log('✅ Demo auctions created successfully')
    }

    // Create demo lots
    console.log('📦 Creating demo lots...')
    const { error: lotsError } = await supabase
      .from('lots')
      .upsert([
        {
          id: 'lot00001-1111-1111-1111-111111111111',
          auction_id: 'live0001-1111-1111-1111-111111111111',
          lot_number: 1,
          title: 'Oil on Canvas - Impressionist Landscape',
          description: 'Beautiful 19th century impressionist landscape painting, oil on canvas.',
          starting_bid: 50000,
          reserve_price: 75000,
          increment: 2500,
          current_high_bid: 87500,
          bid_count: 6,
          category: 'Fine Art',
          estimate_low: 75000,
          estimate_high: 125000,
          images: ['https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500']
        },
        {
          id: 'lot00002-2222-2222-2222-222222222222',
          auction_id: 'live0001-1111-1111-1111-111111111111',
          lot_number: 2,
          title: 'Victorian Mahogany Dining Set',
          description: 'Complete Victorian dining room set including table, 8 chairs, and sideboard.',
          starting_bid: 35000,
          reserve_price: null,
          increment: 1000,
          current_high_bid: 42000,
          bid_count: 8,
          category: 'Furniture',
          estimate_low: 40000,
          estimate_high: 60000,
          images: ['https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=500']
        },
        {
          id: 'mod00001-1111-1111-1111-111111111111',
          auction_id: 'live0002-2222-2222-2222-222222222222',
          lot_number: 1,
          title: 'Abstract Expressionist Painting',
          description: 'Large scale abstract expressionist work in acrylic on canvas.',
          starting_bid: 75000,
          reserve_price: 100000,
          increment: 5000,
          current_high_bid: 125000,
          bid_count: 9,
          category: 'Modern Art',
          estimate_low: 100000,
          estimate_high: 150000,
          images: ['https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500']
        },
        {
          id: 'watch001-1111-1111-1111-111111111111',
          auction_id: 'live0003-3333-3333-3333-333333333333',
          lot_number: 1,
          title: 'Rolex Submariner - Vintage 1970s',
          description: 'Rolex Submariner ref. 5513, circa 1975. Original dial and hands.',
          starting_bid: 120000,
          reserve_price: 150000,
          increment: 5000,
          current_high_bid: 165000,
          bid_count: 11,
          category: 'Watches',
          estimate_low: 150000,
          estimate_high: 200000,
          images: ['https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=500']
        }
      ])

    if (lotsError) {
      console.log('Lots might already exist:', lotsError.message)
    } else {
      console.log('✅ Demo lots created successfully')
    }

    // Add wallet credits for bidders
    console.log('💳 Adding wallet credits...')
    const { error: walletError } = await supabase
      .from('wallet_ledger')
      .upsert([
        {
          id: 'wallet01-1111-1111-1111-111111111111',
          user_id: '44444444-4444-4444-4444-444444444444',
          transaction_type: 'purchase',
          amount: 50000000, // $5,000 in cents
          balance_after: 50000000,
          description: 'Initial credit purchase - $5,000',
          created_at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 'wallet02-2222-2222-2222-222222222222',
          user_id: '55555555-5555-5555-5555-555555555555',
          transaction_type: 'purchase',
          amount: 75000000, // $7,500 in cents
          balance_after: 75000000,
          description: 'Initial credit purchase - $7,500',
          created_at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
        }
      ])

    if (walletError) {
      console.log('Wallet entries might already exist:', walletError.message)
    } else {
      console.log('✅ Wallet credits added successfully')
    }

    console.log('🎉 Demo data seeding completed!')
    console.log('')
    console.log('📧 Admin login: admin@imaginethisauction.com')
    console.log('🔑 You can use this email to access admin features')
    console.log('')
    console.log('📊 Live auctions created:')
    console.log('   • Fine Art & Antiques (Heritage Auctions)')
    console.log('   • Modern & Contemporary Art (Sotheby\'s Demo)')
    console.log('   • Luxury Watches & Jewelry (Heritage Auctions)')
    console.log('')
    console.log('🚀 Visit http://localhost:3002/auctions to see the live auctions!')

  } catch (error) {
    console.error('❌ Error seeding data:', error)
    process.exit(1)
  }
}

seedData()