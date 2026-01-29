#!/usr/bin/env tsx
/**
 * Demo Mode CLI Controller
 *
 * Commands:
 *   --reset --yes    Reset and seed demo data (requires confirmation)
 *   --start          Start auction timers and bot bidders
 *   --stop           Stop all demo processes
 *   --status         Show current demo status
 *
 * Usage:
 *   pnpm tsx scripts/demo-run.ts --reset --yes
 *   pnpm tsx scripts/demo-run.ts --start
 *   pnpm tsx scripts/demo-run.ts --status
 *   pnpm tsx scripts/demo-run.ts --stop
 */

import { Command } from 'commander'
import { createClient } from '@supabase/supabase-js'
import { DEMO, generateDemoRunId, createDemoMetadata, DemoState } from '../config/demo'
import chalk from 'chalk'
import inquirer from 'inquirer'

// Environment setup
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const program = new Command()

// Demo data templates
const AUCTIONEER_TEMPLATES = [
  {
    company_name: "Heritage Estate Sales",
    business_license: "GA-DEMO-001",
    address_line1: "123 Auction Way",
    city: "Atlanta",
    state: "GA",
    zip_code: "30309",
    website: "https://heritage-demo.com"
  },
  {
    company_name: "Vintage Treasures Auction",
    business_license: "GA-DEMO-002",
    address_line1: "456 Collectible Dr",
    city: "Savannah",
    state: "GA",
    zip_code: "31401",
    website: "https://vintage-demo.com"
  },
  {
    company_name: "Modern Art Auctions",
    business_license: "GA-DEMO-003",
    address_line1: "789 Gallery St",
    city: "Augusta",
    state: "GA",
    zip_code: "30901",
    website: "https://modern-demo.com"
  }
]

const LOT_TEMPLATES = {
  sneakers: [
    { title: "Air Jordan 1 Retro High OG", brand: "Nike", description: "Classic colorway from 1985, excellent condition with original box", tags: ["retro", "basketball", "collectible"] },
    { title: "Yeezy Boost 350 V2", brand: "Adidas", description: "Limited edition release, deadstock condition", tags: ["limited", "boost", "kanye"] },
    { title: "Off-White x Nike Blazer", brand: "Nike", description: "Deconstructed basketball silhouette, collaboration piece", tags: ["collaboration", "virgil", "hypebeast"] }
  ],
  electronics: [
    { title: "Vintage Apple Lisa Computer", brand: "Apple", description: "Rare 1983 personal computer, working condition", tags: ["vintage", "computing", "steve-jobs"] },
    { title: "Sony Walkman TPS-L2", brand: "Sony", description: "Original 1979 portable cassette player", tags: ["vintage", "music", "portable"] },
    { title: "Nintendo Game & Watch", brand: "Nintendo", description: "Handheld electronic game from the 1980s", tags: ["gaming", "handheld", "nintendo"] }
  ],
  watches: [
    { title: "Rolex Submariner Date", brand: "Rolex", description: "Professional diving watch, automatic movement", tags: ["diving", "luxury", "swiss"] },
    { title: "Omega Speedmaster Professional", brand: "Omega", description: "Moonwatch chronograph, manual wind", tags: ["chronograph", "space", "omega"] },
    { title: "Patek Philippe Calatrava", brand: "Patek Philippe", description: "Dress watch with small seconds, white gold", tags: ["dress", "luxury", "complications"] }
  ],
  collectibles: [
    { title: "1952 Mickey Mantle Rookie Card", brand: "Topps", description: "PSA graded baseball card, excellent condition", tags: ["baseball", "rookie", "psa"] },
    { title: "Star Wars Luke Skywalker Figure", brand: "Kenner", description: "Vintage 1977 action figure, unopened", tags: ["star-wars", "vintage", "moc"] },
    { title: "Pokemon Charizard Holographic", brand: "Pokemon", description: "Base set holographic card, mint condition", tags: ["pokemon", "holographic", "mint"] }
  ],
  art: [
    { title: "Abstract Expressionist Painting", brand: "Unknown Artist", description: "Oil on canvas, mid-century modern style", tags: ["abstract", "oil", "mid-century"] },
    { title: "Vintage Photography Print", brand: "Gallery Print", description: "Limited edition black and white photograph", tags: ["photography", "limited", "vintage"] },
    { title: "Contemporary Sculpture", brand: "Local Artist", description: "Bronze sculpture with patina finish", tags: ["sculpture", "bronze", "contemporary"] }
  ],
  jewelry: [
    { title: "Art Deco Diamond Ring", brand: "Estate Piece", description: "Platinum setting with natural diamonds", tags: ["art-deco", "diamonds", "platinum"] },
    { title: "Vintage Pearl Necklace", brand: "Mikimoto", description: "Cultured pearl strand with gold clasp", tags: ["pearls", "cultured", "vintage"] },
    { title: "Silver Turquoise Bracelet", brand: "Native American", description: "Handcrafted southwestern jewelry", tags: ["silver", "turquoise", "handmade"] }
  ]
}

// Utility functions
function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function generateBotName(index: number): { first: string; last: string; email: string } {
  const firstNames = ["Alex", "Jordan", "Casey", "Morgan", "Taylor", "Jamie", "Riley", "Avery", "Quinn", "Sage", "Blake", "River", "Phoenix", "Skyler"]
  const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Wilson", "Anderson", "Taylor", "Thomas"]

  const first = getRandomItem(firstNames)
  const last = getRandomItem(lastNames)
  return {
    first,
    last,
    email: `bot${index}@demo.imaginethisauction.com`
  }
}

// Reset command - wipe and reseed demo data
async function resetDemo(runId: string, skipConfirmation = false): Promise<void> {
  console.log(chalk.yellow('🚨 DEMO RESET - This will delete all demo data'))

  if (!skipConfirmation) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to reset all demo data?',
        default: false
      }
    ])

    if (!confirm) {
      console.log(chalk.gray('Reset cancelled'))
      return
    }
  }

  console.log(chalk.blue('🗑️  Cleaning demo data...'))

  // Delete demo data in correct order (respecting foreign keys)
  const tables = [
    'bids',
    'watchlists',
    'lots',
    'auctions',
    'payment_events',
    'audit_log',
    'invoices',
    'users'
  ]

  for (const table of tables) {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .like('demo_label', `%${DEMO.DEMO_LABEL}%`)

      if (error && !error.message.includes('does not exist')) {
        console.warn(chalk.yellow(`Warning: Failed to clean ${table}: ${error.message}`))
      }
    } catch (err) {
      console.warn(chalk.yellow(`Warning: Could not access table ${table}`))
    }
  }

  console.log(chalk.green('✅ Demo data cleaned'))
  console.log(chalk.blue('🌱 Seeding new demo data...'))

  const metadata = createDemoMetadata(runId)

  // 1. Create demo users (auctioneers)
  const auctioneerUsers = []
  for (let i = 0; i < DEMO.NUM_AUCTIONEERS; i++) {
    const template = AUCTIONEER_TEMPLATES[i]
    const userId = `demo-auctioneer-${i + 1}-${runId}`

    const { error } = await supabase.from('users').upsert({
      id: userId,
      email: `auctioneer${i + 1}@demo.imaginethisauction.com`,
      first_name: template.company_name.split(' ')[0],
      last_name: 'Demo',
      role: 'auctioneer',
      is_approved: true,
      demo_label: DEMO.DEMO_LABEL,
      ...metadata
    })

    if (error) throw error
    auctioneerUsers.push(userId)
  }

  // 2. Create auctioneer organizations
  const auctioneers = []
  for (let i = 0; i < DEMO.NUM_AUCTIONEERS; i++) {
    const template = AUCTIONEER_TEMPLATES[i]
    const auctioneerId = `demo-org-${i + 1}-${runId}`

    const { error } = await supabase.from('auctioneers').upsert({
      id: auctioneerId,
      user_id: auctioneerUsers[i],
      company_name: template.company_name,
      business_license: template.business_license,
      address_line1: template.address_line1,
      city: template.city,
      state: template.state,
      zip_code: template.zip_code,
      website: template.website,
      is_approved: true,
      approval_date: new Date().toISOString(),
      demo_label: DEMO.DEMO_LABEL,
      ...metadata
    })

    if (error) throw error
    auctioneers.push(auctioneerId)
  }

  // 3. Create bot bidders
  const botUsers = []
  for (let i = 0; i < DEMO.NUM_BOT_BIDDERS; i++) {
    const bot = generateBotName(i + 1)
    const strategy = getRandomItem(DEMO.BOT_STRATEGIES)
    const userId = `demo-bot-${i + 1}-${runId}`

    const { error } = await supabase.from('users').upsert({
      id: userId,
      email: bot.email,
      first_name: bot.first,
      last_name: bot.last,
      role: 'bidder',
      is_approved: true,
      demo_label: DEMO.DEMO_LABEL,
      metadata: {
        ...metadata,
        is_bot: true,
        bot_strategy: strategy
      }
    })

    if (error) throw error
    botUsers.push(userId)

    // Add bot credits
    await supabase.rpc('add_wallet_credits', {
      p_user_id: userId,
      p_amount_itc: DEMO.CREDIT_TOPUP_ITC,
      p_description: `Demo bot initial credits`,
      p_reference_type: 'demo_seed',
      p_reference_id: runId
    })
  }

  // 4. Create human demo users
  const humanUsers = []
  for (let i = 0; i < 3; i++) {
    const userId = `demo-human-${i + 1}-${runId}`

    const { error } = await supabase.from('users').upsert({
      id: userId,
      email: `human${i + 1}@demo.imaginethisauction.com`,
      first_name: ['Demo', 'Test', 'Sample'][i],
      last_name: 'User',
      role: 'bidder',
      is_approved: true,
      demo_label: DEMO.DEMO_LABEL,
      ...metadata
    })

    if (error) throw error
    humanUsers.push(userId)

    // Add human credits
    await supabase.rpc('add_wallet_credits', {
      p_user_id: userId,
      p_amount_itc: DEMO.HUMAN_SEED_ITC,
      p_description: `Demo human initial credits`,
      p_reference_type: 'demo_seed',
      p_reference_id: runId
    })
  }

  // 5. Create auctions
  const auctions = []
  const startTime = new Date(Date.now() + DEMO.AUCTION_START_DELAY_MIN * 60 * 1000)

  for (let i = 0; i < DEMO.NUM_AUCTIONEERS; i++) {
    for (let j = 0; j < DEMO.AUCTIONS_PER_AUCTIONEER; j++) {
      const auctionId = `demo-auction-${i + 1}-${j + 1}-${runId}`
      const auctionStartTime = new Date(startTime.getTime() + (j * 30000)) // 30s apart

      const { error } = await supabase.from('auctions').upsert({
        id: auctionId,
        auctioneer_id: auctioneers[i],
        title: `${AUCTIONEER_TEMPLATES[i].company_name} Demo Auction ${j + 1}`,
        description: `Live demo auction featuring collectibles, electronics, and more`,
        starts_at: auctionStartTime.toISOString(),
        ends_at: new Date(auctionStartTime.getTime() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours
        status: 'scheduled',
        buyer_premium_percent: 10,
        demo_label: DEMO.DEMO_LABEL,
        ...metadata
      })

      if (error) throw error
      auctions.push({ id: auctionId, auctioneer_id: auctioneers[i] })
    }
  }

  // 6. Create lots
  let lotCount = 0
  for (const auction of auctions) {
    for (let k = 0; k < DEMO.LOTS_PER_AUCTION; k++) {
      const category = getRandomItem(Object.keys(LOT_TEMPLATES))
      const template = getRandomItem(LOT_TEMPLATES[category as keyof typeof LOT_TEMPLATES])
      const lotId = `demo-lot-${++lotCount}-${runId}`

      const startPrice = getRandomInt(DEMO.LOT_MIN_START_ITC, DEMO.LOT_MAX_START_ITC)
      const estimateLow = Math.max(startPrice, getRandomInt(DEMO.LOT_MIN_ESTIMATE_ITC, DEMO.LOT_MAX_ESTIMATE_ITC))
      const estimateHigh = estimateLow + getRandomInt(100, 500)

      // Get placeholder image
      const categoryImages = DEMO.PLACEHOLDER_IMAGES[category as keyof typeof DEMO.PLACEHOLDER_IMAGES] ||
                           DEMO.PLACEHOLDER_IMAGES.collectibles
      const image = getRandomItem(categoryImages)

      const lotData = {
        id: lotId,
        auction_id: auction.id,
        lot_number: k + 1,
        title: template.title,
        description: template.description,
        category: category,
        brand: template.brand,
        tags: template.tags,
        start_price_itc: startPrice,
        estimate_low_itc: estimateLow,
        estimate_high_itc: estimateHigh,
        status: 'approved',
        images: [image],
        demo_label: DEMO.DEMO_LABEL,
        ...metadata
      }

      const { error } = await supabase.from('lots').upsert(lotData)
      if (error) throw error

      // Generate hype copy
      try {
        const copyResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/ai/copywriter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lots: [lotData],
            style: 'Hype',
            batch_id: `demo-hype-${runId}`
          })
        })

        if (copyResponse.ok) {
          console.log(chalk.gray(`Generated hype copy for ${template.title}`))
        }
      } catch (err) {
        console.warn(chalk.yellow(`Could not generate hype copy for ${template.title}`))
      }
    }
  }

  console.log(chalk.green('✅ Demo seeding completed!'))
  console.log(chalk.blue(`📊 Created:`))
  console.log(`   - ${DEMO.NUM_AUCTIONEERS} auctioneers`)
  console.log(`   - ${auctions.length} auctions`)
  console.log(`   - ${lotCount} lots`)
  console.log(`   - ${DEMO.NUM_BOT_BIDDERS} bot bidders`)
  console.log(`   - 3 human demo users`)
  console.log(chalk.yellow(`🏷️  Demo Run ID: ${runId}`))
}

// Start command - begin auction timers and bots
async function startDemo(): Promise<void> {
  if (!DEMO.ENABLED) {
    console.log(chalk.red('❌ Demo mode is not enabled'))
    return
  }

  const runId = generateDemoRunId()
  console.log(chalk.blue(`🚀 Starting demo mode...`))
  console.log(chalk.yellow(`🏷️  Demo Run ID: ${runId}`))

  // Update auction statuses to live
  const { data: auctions, error: auctionError } = await supabase
    .from('auctions')
    .select('id')
    .eq('demo_label', DEMO.DEMO_LABEL)
    .eq('status', 'scheduled')

  if (auctionError) {
    console.error(chalk.red('❌ Failed to fetch auctions:', auctionError.message))
    return
  }

  if (auctions && auctions.length > 0) {
    await supabase
      .from('auctions')
      .update({ status: 'live' })
      .in('id', auctions.map(a => a.id))

    console.log(chalk.green(`✅ Activated ${auctions.length} demo auctions`))
  }

  // Start auction timer worker
  console.log(chalk.blue('⏰ Starting auction timer...'))
  // Note: In production, this would start PM2 processes
  // For now, we'll create API endpoints that can be called

  DemoState.getInstance().start(runId)
  console.log(chalk.green('✅ Demo mode started!'))
  console.log(chalk.blue('💡 Visit /admin/demo to monitor live auctions'))
}

// Status command - show current demo state
async function showStatus(): Promise<void> {
  console.log(chalk.blue('📊 Demo Status'))
  console.log('─'.repeat(50))

  const state = DemoState.getInstance()
  console.log(`Status: ${state.isRunning ? chalk.green('RUNNING') : chalk.gray('STOPPED')}`)
  if (state.runId) {
    console.log(`Run ID: ${chalk.yellow(state.runId)}`)
    console.log(`Uptime: ${Math.floor(state.getUptime() / 1000)}s`)
  }

  // Fetch demo data
  const { data: auctions } = await supabase
    .from('auctions')
    .select(`
      id, title, status,
      lots!inner(id, title, start_price_itc, status),
      auctioneers!inner(company_name)
    `)
    .eq('demo_label', DEMO.DEMO_LABEL)

  if (auctions) {
    console.log('\n🏛️  Demo Auctions:')
    for (const auction of auctions) {
      console.log(`   ${auction.auctioneers.company_name}: ${auction.title} (${auction.status})`)
      console.log(`      Lots: ${auction.lots.length}`)
    }
  }

  // Fetch bid activity
  const { data: recentBids } = await supabase
    .from('bids')
    .select(`
      amount_itc, created_at,
      users!inner(first_name, demo_label),
      lots!inner(title, demo_label)
    `)
    .eq('users.demo_label', DEMO.DEMO_LABEL)
    .eq('lots.demo_label', DEMO.DEMO_LABEL)
    .order('created_at', { ascending: false })
    .limit(5)

  if (recentBids && recentBids.length > 0) {
    console.log('\n🔥 Recent Demo Bids:')
    for (const bid of recentBids) {
      const timeAgo = Math.floor((Date.now() - new Date(bid.created_at).getTime()) / 1000)
      console.log(`   ${bid.users.first_name}: ${bid.amount_itc} ITC on "${bid.lots.title}" (${timeAgo}s ago)`)
    }
  }
}

// Stop command - halt all demo processes
async function stopDemo(): Promise<void> {
  console.log(chalk.yellow('🛑 Stopping demo mode...'))

  // Stop auction timers and bots
  DemoState.getInstance().stop()

  // Update auction statuses
  await supabase
    .from('auctions')
    .update({ status: 'ended' })
    .eq('demo_label', DEMO.DEMO_LABEL)
    .eq('status', 'live')

  console.log(chalk.green('✅ Demo mode stopped'))
}

// CLI setup
program
  .name('demo-run')
  .description('Demo Mode Controller')
  .version('1.0.0')

program
  .option('--reset', 'Reset and seed demo data')
  .option('--yes', 'Skip confirmation prompts')
  .option('--start', 'Start demo mode')
  .option('--stop', 'Stop demo mode')
  .option('--status', 'Show demo status')
  .action(async (options) => {
    try {
      if (options.reset) {
        const runId = generateDemoRunId()
        await resetDemo(runId, options.yes)
      } else if (options.start) {
        await startDemo()
      } else if (options.stop) {
        await stopDemo()
      } else if (options.status) {
        await showStatus()
      } else {
        program.help()
      }
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message)
      process.exit(1)
    }
  })

program.parse(process.argv)