/**
 * End-to-End Test: Lot Publish → Hype Generation → Notification Delivery
 * @jest-environment node
 */

import { createClient } from '@supabase/supabase-js'

// Test configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key'
const testUserId = '12345678-1234-1234-1234-123456789012'
const testAuctionId = '87654321-4321-4321-4321-210987654321'

describe('E2E: Notification Flow', () => {
  let supabase: any
  let testLotId: string

  beforeAll(async () => {
    // Initialize Supabase client
    supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Create test user
    await supabase.from('users').upsert({
      id: testUserId,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      role: 'bidder',
      is_approved: true,
      notification_prefs: {
        email: true,
        push: true,
        sms: false,
        quiet_hours: [22, 7]
      }
    })

    // Create test auction
    await supabase.from('auctions').upsert({
      id: testAuctionId,
      title: 'Test Auction',
      status: 'live',
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    })

    // Create test user interests
    await supabase.from('user_interests').upsert([
      { user_id: testUserId, tag: 'Watches', weight: 5 },
      { user_id: testUserId, tag: 'Vintage', weight: 3 }
    ])
  })

  afterAll(async () => {
    // Cleanup test data
    await supabase.from('notifications').delete().eq('user_id', testUserId)
    await supabase.from('lots').delete().eq('id', testLotId)
    await supabase.from('user_interests').delete().eq('user_id', testUserId)
    await supabase.from('auctions').delete().eq('id', testAuctionId)
    await supabase.from('users').delete().eq('id', testUserId)
  })

  it('should complete full notification flow', async () => {
    // Step 1: Create a lot in 'draft' status
    const { data: lot, error: lotError } = await supabase
      .from('lots')
      .insert({
        auction_id: testAuctionId,
        title: 'Vintage Rolex Watch',
        description: 'A rare vintage timepiece from 1960',
        category: 'Watches',
        brand: 'Rolex',
        tags: ['Vintage', 'Luxury'],
        start_price_itc: 1000,
        status: 'draft'
      })
      .select()
      .single()

    expect(lotError).toBeNull()
    expect(lot).toBeTruthy()
    testLotId = lot.id

    // Step 2: Publish the lot (trigger hype generation)
    const { error: updateError } = await supabase
      .from('lots')
      .update({ status: 'published' })
      .eq('id', testLotId)

    expect(updateError).toBeNull()

    // Step 3: Wait for lot publish edge function to process
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Step 4: Check that hype copy was generated
    const { data: updatedLot } = await supabase
      .from('lots')
      .select('hype_copy')
      .eq('id', testLotId)
      .single()

    expect(updatedLot.hype_copy).toBeTruthy()
    expect(updatedLot.hype_copy.headline).toBeTruthy()
    expect(updatedLot.hype_copy.teaser).toBeTruthy()
    expect(updatedLot.hype_copy.cta).toBeTruthy()

    // Step 5: Check that notifications were queued
    const { data: notifications } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', testUserId)
      .eq('status', 'pending')

    expect(notifications).toBeTruthy()
    expect(notifications.length).toBeGreaterThan(0)

    // Should have email notification for interest match
    const emailNotification = notifications.find(n => n.type === 'email')
    expect(emailNotification).toBeTruthy()
    expect(emailNotification.content.lot.id).toBe(testLotId)
    expect(emailNotification.content.matched_tags).toContain('Watches')

    // Step 6: Test email delivery (dry run)
    const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/notifications/deliver-email-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: testUserId,
        dry_run: true,
        limit: 10
      })
    })

    const emailResult = await emailResponse.json()
    expect(emailResult.success).toBe(true)
    expect(emailResult.processed).toBeGreaterThan(0)

    // Step 7: Test push notification delivery (dry run)
    const pushResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/notifications/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: testUserId,
        dry_run: true,
        limit: 10
      })
    })

    const pushResult = await pushResponse.json()
    expect(pushResult.success).toBe(true)

    // Step 8: Test daily recommendations
    const recommendationResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/edge-functions/recommend-daily`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: testUserId
      })
    })

    const recommendationResult = await recommendationResponse.json()
    expect(recommendationResult.success).toBe(true)
    expect(recommendationResult.processed_users).toBe(1)
    expect(recommendationResult.notifications_queued).toBeGreaterThan(0)

    // Step 9: Verify recommendation accuracy
    const { data: recommendations } = await supabase
      .rpc('get_user_recommendations', {
        p_user_id: testUserId,
        p_limit: 5
      })

    expect(recommendations).toBeTruthy()
    expect(recommendations.length).toBeGreaterThan(0)

    // Should include our test lot due to matching interests
    const recommendedLot = recommendations.find((r: any) => r.lot_id === testLotId)
    expect(recommendedLot).toBeTruthy()
    expect(recommendedLot.score).toBeGreaterThan(0)
  }, 30000) // 30 second timeout for E2E test

  it('should respect quiet hours', async () => {
    // Update user to have current time in quiet hours
    const currentHour = new Date().getHours()
    await supabase.from('users').update({
      notification_prefs: {
        email: true,
        push: true,
        sms: false,
        quiet_hours: [currentHour, (currentHour + 1) % 24]
      }
    }).eq('id', testUserId)

    // Trigger recommendations during quiet hours
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/edge-functions/recommend-daily`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: testUserId
      })
    })

    const result = await response.json()
    expect(result.success).toBe(true)
    expect(result.skipped_users).toBe(1) // User should be skipped due to quiet hours
  })

  it('should handle notification preferences', async () => {
    // Disable email notifications
    await supabase.from('users').update({
      notification_prefs: {
        email: false,
        push: true,
        sms: false,
        quiet_hours: [22, 7]
      }
    }).eq('id', testUserId)

    // Create another lot to trigger notifications
    const { data: lot2 } = await supabase
      .from('lots')
      .insert({
        auction_id: testAuctionId,
        title: 'Another Vintage Watch',
        description: 'Another rare timepiece',
        category: 'Watches',
        tags: ['Vintage'],
        start_price_itc: 2000,
        status: 'published'
      })
      .select()
      .single()

    await new Promise(resolve => setTimeout(resolve, 1000))

    // Check notifications - should only have push, not email
    const { data: notifications } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', testUserId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5)

    const recentEmailNotifications = notifications.filter(n => n.type === 'email')
    const recentPushNotifications = notifications.filter(n => n.type === 'push')

    expect(recentEmailNotifications.length).toBe(0) // Email disabled
    expect(recentPushNotifications.length).toBeGreaterThan(0) // Push enabled

    // Cleanup
    await supabase.from('lots').delete().eq('id', lot2.id)
  })
})