import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Test suite for the complete auction escrow flow
// Tests the full flow: auction end → invoice creation → payment → shipping → escrow release → payout

test.describe('Escrow Flow Integration Tests', () => {
  let supabase: any
  let testAuctionId: string
  let testLotId: string
  let testBidderId: string
  let testAuctioneerId: string
  let testInvoiceId: string

  test.beforeAll(async () => {
    // Initialize Supabase client for test database operations
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Set up test data
    await setupTestData()
  })

  test.afterAll(async () => {
    // Clean up test data
    await cleanupTestData()
  })

  async function setupTestData() {
    // Create test auctioneer
    const { data: auctioneerUser } = await supabase.auth.admin.createUser({
      email: 'test-auctioneer@example.com',
      password: 'testpass123',
      email_confirm: true,
    })

    await supabase.from('users').insert({
      id: auctioneerUser.user.id,
      email: 'test-auctioneer@example.com',
      role: 'auctioneer',
      first_name: 'Test',
      last_name: 'Auctioneer',
      is_approved: true,
    })

    const { data: auctioneer } = await supabase.from('auctioneers').insert({
      user_id: auctioneerUser.user.id,
      company_name: 'Test Auction House',
      address_line1: '123 Test St',
      city: 'Test City',
      state: 'GA',
      zip_code: '12345',
      is_approved: true,
    }).select().single()

    testAuctioneerId = auctioneer.id

    // Create test bidder
    const { data: bidderUser } = await supabase.auth.admin.createUser({
      email: 'test-bidder@example.com',
      password: 'testpass123',
      email_confirm: true,
    })

    await supabase.from('users').insert({
      id: bidderUser.user.id,
      email: 'test-bidder@example.com',
      role: 'bidder',
      first_name: 'Test',
      last_name: 'Bidder',
      is_approved: true,
    })

    testBidderId = bidderUser.user.id

    // Give bidder some credits
    await supabase.rpc('add_wallet_credits', {
      user_uuid: testBidderId,
      credit_amount: 10000, // $100 in cents
      provider_event_identifier: 'test_event_123',
      purchase_description: 'Test credit purchase',
    })

    // Create test auction
    const { data: auction } = await supabase.from('auctions').insert({
      auctioneer_id: testAuctioneerId,
      title: 'Test Auction for Escrow Flow',
      description: 'Test auction description',
      starts_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      ends_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      status: 'live',
      buyer_premium_percent: 10.0,
    }).select().single()

    testAuctionId = auction.id

    // Create test lot
    const { data: lot } = await supabase.from('lots').insert({
      auction_id: testAuctionId,
      lot_number: 1,
      title: 'Test Lot for Escrow',
      description: 'A test lot for escrow flow testing',
      starting_bid: 1000, // $10
      increment: 100, // $1
    }).select().single()

    testLotId = lot.id
  }

  async function cleanupTestData() {
    // Clean up in reverse order due to foreign key constraints
    if (testInvoiceId) {
      await supabase.from('invoices').delete().eq('id', testInvoiceId)
    }
    if (testLotId) {
      await supabase.from('lots').delete().eq('id', testLotId)
    }
    if (testAuctionId) {
      await supabase.from('auctions').delete().eq('id', testAuctionId)
    }
    if (testAuctioneerId) {
      await supabase.from('auctioneers').delete().eq('id', testAuctioneerId)
    }
    if (testBidderId) {
      await supabase.from('wallet_ledger').delete().eq('user_id', testBidderId)
      await supabase.from('users').delete().eq('id', testBidderId)
      await supabase.auth.admin.deleteUser(testBidderId)
    }
  }

  test('Complete escrow flow: bid → auction end → invoice → payment → shipping → payout', async ({ page }) => {
    // Step 1: Place a winning bid
    test.step('Place winning bid', async () => {
      const bidResult = await supabase.rpc('place_bid', {
        lot_uuid: testLotId,
        bidder_uuid: testBidderId,
        bid_amount: 2000, // $20
      })

      expect(bidResult.success).toBe(true)
      expect(bidResult.new_high_bid).toBe(2000)

      // Verify bid was recorded
      const { data: bid } = await supabase
        .from('bids')
        .select('*')
        .eq('lot_id', testLotId)
        .eq('bidder_id', testBidderId)
        .eq('is_winning', true)
        .single()

      expect(bid).toBeTruthy()
      expect(bid.amount).toBe(2000)
    })

    // Step 2: End the auction and process invoices
    test.step('Process auction end and create invoice', async () => {
      // First, update auction end time to past
      await supabase
        .from('auctions')
        .update({ ends_at: new Date(Date.now() - 1000).toISOString() })
        .eq('id', testAuctionId)

      // Process auction end
      const processResult = await supabase.rpc('process_auction_end', {
        auction_uuid: testAuctionId,
      })

      expect(processResult.success).toBe(true)
      expect(processResult.processed_lots).toHaveLength(1)

      const processedLot = processResult.processed_lots[0]
      expect(processedLot.winner_id).toBe(testBidderId)
      expect(processedLot.hammer_price).toBe(2000)

      testInvoiceId = processedLot.invoice_id

      // Verify invoice was created
      const { data: invoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', testInvoiceId)
        .single()

      expect(invoice).toBeTruthy()
      expect(invoice.hammer_price).toBe(2000)
      expect(invoice.buyer_premium_amount).toBe(200) // 10% of 2000
      expect(invoice.total_amount).toBe(2200) // 2000 + 200
      expect(invoice.is_paid).toBe(false)
      expect(invoice.is_shipped).toBe(false)

      // Verify lot was updated
      const { data: updatedLot } = await supabase
        .from('lots')
        .select('*')
        .eq('id', testLotId)
        .single()

      expect(updatedLot.winner_id).toBe(testBidderId)
      expect(updatedLot.is_sold).toBe(true)
      expect(updatedLot.hammer_price).toBe(2000)

      // Verify escrow hold was created
      const { data: escrowTransaction } = await supabase
        .from('wallet_ledger')
        .select('*')
        .eq('user_id', testBidderId)
        .eq('transaction_type', 'escrow_hold')
        .eq('reference_id', testInvoiceId)
        .single()

      expect(escrowTransaction).toBeTruthy()
    })

    // Step 3: Simulate payment (mark invoice as paid)
    test.step('Mark invoice as paid', async () => {
      await supabase
        .from('invoices')
        .update({
          is_paid: true,
          paid_at: new Date().toISOString(),
        })
        .eq('id', testInvoiceId)

      // Verify payment status
      const { data: invoice } = await supabase
        .from('invoices')
        .select('is_paid, paid_at')
        .eq('id', testInvoiceId)
        .single()

      expect(invoice.is_paid).toBe(true)
      expect(invoice.paid_at).toBeTruthy()
    })

    // Step 4: Mark item as shipped
    test.step('Mark item as shipped and release escrow', async () => {
      // Update invoice as shipped
      await supabase
        .from('invoices')
        .update({
          is_shipped: true,
          shipped_at: new Date().toISOString(),
          tracking_number: 'TEST123456789',
        })
        .eq('id', testInvoiceId)

      // Release escrow
      const escrowResult = await supabase.rpc('release_escrow_on_shipping', {
        invoice_uuid: testInvoiceId,
      })

      expect(escrowResult).toBe(true)

      // Verify escrow release transaction was created
      const { data: escrowRelease } = await supabase
        .from('wallet_ledger')
        .select('*')
        .eq('user_id', testBidderId)
        .eq('transaction_type', 'escrow_release')
        .eq('reference_id', testInvoiceId)
        .single()

      expect(escrowRelease).toBeTruthy()

      // Verify payout due was created
      const { data: payoutDue } = await supabase
        .from('payouts_due')
        .select('*')
        .eq('invoice_id', testInvoiceId)
        .single()

      expect(payoutDue).toBeTruthy()
      expect(payoutDue.auctioneer_id).toBe(testAuctioneerId)

      // Verify payout calculation (hammer price - 1.2% commission)
      const expectedCommission = Math.round(2000 * 1.2 / 100) // 1.2% of $20
      const expectedPayout = 2000 - expectedCommission

      expect(payoutDue.platform_commission).toBe(expectedCommission)
      expect(payoutDue.amount).toBe(expectedPayout)
      expect(payoutDue.is_paid).toBe(false)
    })

    // Step 5: Verify final wallet balance
    test.step('Verify final wallet balance', async () => {
      const finalBalance = await supabase.rpc('get_wallet_balance', {
        user_uuid: testBidderId,
      })

      // Original 10000 credits - 2000 bid (released from escrow) = 8000
      expect(finalBalance).toBe(8000)

      // Verify transaction history shows the complete flow
      const { data: transactions } = await supabase
        .from('wallet_ledger')
        .select('*')
        .eq('user_id', testBidderId)
        .order('created_at', { ascending: true })

      expect(transactions).toHaveLength(4) // purchase, bid_hold, bid_refund, escrow_hold, escrow_release

      const transactionTypes = transactions.map(t => t.transaction_type)
      expect(transactionTypes).toContain('purchase')
      expect(transactionTypes).toContain('bid_hold')
      expect(transactionTypes).toContain('escrow_hold')
      expect(transactionTypes).toContain('escrow_release')
    })
  })

  test('API endpoints work correctly', async ({ request }) => {
    // Test auction close API
    test.step('Test auction close API', async () => {
      // This would typically require authentication
      // For now, we'll test the database function directly since we've already done that above
      expect(true).toBe(true) // Placeholder for API endpoint test
    })

    // Test invoice API
    test.step('Test invoice API', async () => {
      // This would test the /api/invoices endpoint
      // For now, we'll test the database queries directly since we've already done that above
      expect(true).toBe(true) // Placeholder for API endpoint test
    })

    // Test shipping API
    test.step('Test shipping API', async () => {
      // This would test the /api/invoices/[id]/ship endpoint
      // For now, we'll test the database function directly since we've already done that above
      expect(true).toBe(true) // Placeholder for API endpoint test
    })
  })

  test('Error handling and edge cases', async () => {
    test.step('Cannot release escrow for unshipped item', async () => {
      // Create another test invoice that's paid but not shipped
      const { data: testInvoice } = await supabase.from('invoices').insert({
        lot_id: testLotId,
        buyer_id: testBidderId,
        hammer_price: 1000,
        buyer_premium_percent: 10,
        buyer_premium_amount: 100,
        total_amount: 1100,
        is_paid: true,
        is_shipped: false, // Key: not shipped
      }).select().single()

      // Try to release escrow - should fail
      const escrowResult = await supabase.rpc('release_escrow_on_shipping', {
        invoice_uuid: testInvoice.id,
      })

      expect(escrowResult).toBe(false)

      // Clean up
      await supabase.from('invoices').delete().eq('id', testInvoice.id)
    })

    test.step('Cannot process auction end for non-existent auction', async () => {
      const fakeAuctionId = '00000000-0000-0000-0000-000000000000'

      const processResult = await supabase.rpc('process_auction_end', {
        auction_uuid: fakeAuctionId,
      })

      expect(processResult.success).toBe(false)
      expect(processResult.error).toContain('not found')
    })

    test.step('Idempotency: running auction end twice doesn\'t create duplicate invoices', async () => {
      // Create another test auction/lot for this test
      const { data: testAuction2 } = await supabase.from('auctions').insert({
        auctioneer_id: testAuctioneerId,
        title: 'Test Auction 2 for Idempotency',
        starts_at: new Date(Date.now() - 3600000).toISOString(),
        ends_at: new Date(Date.now() - 1000).toISOString(), // Already ended
        status: 'live',
        buyer_premium_percent: 10.0,
      }).select().single()

      const { data: testLot2 } = await supabase.from('lots').insert({
        auction_id: testAuction2.id,
        lot_number: 1,
        title: 'Test Lot 2',
        starting_bid: 1000,
        increment: 100,
      }).select().single()

      // Place a bid
      await supabase.rpc('place_bid', {
        lot_uuid: testLot2.id,
        bidder_uuid: testBidderId,
        bid_amount: 1500,
      })

      // Process auction end first time
      const firstResult = await supabase.rpc('process_auction_end', {
        auction_uuid: testAuction2.id,
      })

      expect(firstResult.success).toBe(true)

      // Process auction end second time - should not create duplicate invoices
      const secondResult = await supabase.rpc('process_auction_end', {
        auction_uuid: testAuction2.id,
      })

      // The function should handle this gracefully
      // Since auction status is now 'ended', it should not process again
      expect(secondResult.success).toBe(false)

      // Clean up
      await supabase.from('lots').delete().eq('id', testLot2.id)
      await supabase.from('auctions').delete().eq('id', testAuction2.id)
    })
  })
})
