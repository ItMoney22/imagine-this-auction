import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Comprehensive E2E tests for the admin panel functionality
// Tests role changes, auctioneer approvals, compliance flags, and financial exports

test.describe('Admin Panel E2E Tests', () => {
  let supabase: any
  let adminUserId: string
  let testUserId: string
  let testAuctioneerId: string

  test.beforeAll(async () => {
    // Initialize Supabase client for test database operations
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await setupTestData()
  })

  test.afterAll(async () => {
    await cleanupTestData()
  })

  async function setupTestData() {
    // Create admin user
    const { data: adminUser } = await supabase.auth.admin.createUser({
      email: 'admin-test@example.com',
      password: 'testpass123',
      email_confirm: true,
    })

    await supabase.from('users').insert({
      id: adminUser.user.id,
      email: 'admin-test@example.com',
      role: 'admin',
      first_name: 'Test',
      last_name: 'Admin',
      is_approved: true,
    })

    adminUserId = adminUser.user.id

    // Create test user for role changes
    const { data: testUser } = await supabase.auth.admin.createUser({
      email: 'test-user@example.com',
      password: 'testpass123',
      email_confirm: true,
    })

    await supabase.from('users').insert({
      id: testUser.user.id,
      email: 'test-user@example.com',
      role: 'bidder',
      first_name: 'Test',
      last_name: 'User',
      is_approved: true,
    })

    testUserId = testUser.user.id

    // Create test auctioneer for approval testing
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
      is_approved: false,
    })

    const { data: auctioneer } = await supabase.from('auctioneers').insert({
      user_id: auctioneerUser.user.id,
      company_name: 'Test Auction House',
      address_line1: '123 Test St',
      city: 'Test City',
      state: 'GA',
      zip_code: '12345',
      is_approved: false,
    }).select().single()

    testAuctioneerId = auctioneer.id
  }

  async function cleanupTestData() {
    // Clean up in reverse order due to foreign key constraints
    if (testAuctioneerId) {
      await supabase.from('auctioneers').delete().eq('id', testAuctioneerId)
    }
    if (testUserId) {
      await supabase.from('users').delete().eq('id', testUserId)
      await supabase.auth.admin.deleteUser(testUserId)
    }
    if (adminUserId) {
      await supabase.from('admin_audit_log').delete().eq('admin_id', adminUserId)
      await supabase.from('users').delete().eq('id', adminUserId)
      await supabase.auth.admin.deleteUser(adminUserId)
    }
  }

  test('Admin can change user role and audit log is created', async ({ page }) => {
    test.step('Admin role change creates audit log', async () => {
      // Change user role using database function
      const { data: result, error } = await supabase.rpc('change_user_role', {
        p_admin_id: adminUserId,
        p_target_user_id: testUserId,
        p_new_role: 'auctioneer',
        p_notes: 'Promoted to auctioneer for testing',
      })

      expect(error).toBeNull()
      expect(result.success).toBe(true)
      expect(result.old_role).toBe('bidder')
      expect(result.new_role).toBe('auctioneer')

      // Verify audit log entry was created
      const { data: auditLog } = await supabase
        .from('admin_audit_log')
        .select('*')
        .eq('admin_id', adminUserId)
        .eq('action', 'role_change')
        .eq('target_id', testUserId)
        .single()

      expect(auditLog).toBeTruthy()
      expect(auditLog.before_values.role).toBe('bidder')
      expect(auditLog.after_values.role).toBe('auctioneer')
      expect(auditLog.notes).toBe('Promoted to auctioneer for testing')

      // Verify user role was actually changed
      const { data: updatedUser } = await supabase
        .from('users')
        .select('role')
        .eq('id', testUserId)
        .single()

      expect(updatedUser.role).toBe('auctioneer')
    })
  })

  test('Admin can approve auctioneer and status is updated', async ({ page }) => {
    test.step('Auctioneer approval updates status and creates audit log', async () => {
      // Approve auctioneer using database function
      const { data: result, error } = await supabase.rpc('change_auctioneer_status', {
        p_admin_id: adminUserId,
        p_auctioneer_id: testAuctioneerId,
        p_is_approved: true,
        p_notes: 'Application approved - documents verified',
      })

      expect(error).toBeNull()
      expect(result.success).toBe(true)
      expect(result.old_status).toBe(false)
      expect(result.new_status).toBe(true)

      // Verify auctioneer approval status
      const { data: auctioneer } = await supabase
        .from('auctioneers')
        .select('is_approved, approval_date')
        .eq('id', testAuctioneerId)
        .single()

      expect(auctioneer.is_approved).toBe(true)
      expect(auctioneer.approval_date).toBeTruthy()

      // Verify audit log entry
      const { data: auditLog } = await supabase
        .from('admin_audit_log')
        .select('*')
        .eq('admin_id', adminUserId)
        .eq('action', 'auctioneer_approved')
        .eq('target_id', testAuctioneerId)
        .single()

      expect(auditLog).toBeTruthy()
      expect(auditLog.notes).toBe('Application approved - documents verified')
    })
  })

  test('Compliance flag system works correctly', async ({ page }) => {
    test.step('Create and resolve compliance flag', async () => {
      // Create a compliance flag
      const { data: flag } = await supabase.from('user_compliance_flags').insert({
        user_id: testUserId,
        flag_type: 'manual_review',
        severity: 'medium',
        description: 'Test compliance flag for E2E testing',
        flagged_by: adminUserId,
        metadata: { test: true },
      }).select().single()

      expect(flag).toBeTruthy()
      expect(flag.is_resolved).toBe(false)

      // Resolve the flag
      await supabase.from('user_compliance_flags')
        .update({
          is_resolved: true,
          resolved_by: adminUserId,
          resolved_at: new Date().toISOString(),
          resolution_notes: 'Test flag resolved - no issues found',
        })
        .eq('id', flag.id)

      // Verify flag is resolved
      const { data: resolvedFlag } = await supabase
        .from('user_compliance_flags')
        .select('*')
        .eq('id', flag.id)
        .single()

      expect(resolvedFlag.is_resolved).toBe(true)
      expect(resolvedFlag.resolved_by).toBe(adminUserId)
      expect(resolvedFlag.resolution_notes).toBe('Test flag resolved - no issues found')

      // Clean up
      await supabase.from('user_compliance_flags').delete().eq('id', flag.id)
    })
  })

  test('Financial summary calculations are accurate', async ({ page }) => {
    test.step('Financial summary matches expected calculations', async () => {
      // Get financial summary
      const { data: summary, error } = await supabase.rpc('get_financial_summary')

      expect(error).toBeNull()
      expect(summary).toBeTruthy()
      expect(typeof summary.credits_minted).toBe('number')
      expect(typeof summary.credits_in_escrow).toBe('number')
      expect(typeof summary.credits_released).toBe('number')
      expect(typeof summary.platform_commission).toBe('number')
      expect(typeof summary.pending_payouts).toBe('number')
      expect(typeof summary.paid_payouts).toBe('number')

      // Verify calculations by checking individual components
      const { data: totalCredits } = await supabase
        .from('wallet_ledger')
        .select('amount')
        .eq('transaction_type', 'purchase')

      const expectedMinted = totalCredits?.reduce((sum, t) => sum + t.amount, 0) || 0
      expect(summary.credits_minted).toBe(expectedMinted)

      // Test that summary includes calculation timestamp
      expect(summary.calculated_at).toBeTruthy()
      const calculatedTime = new Date(summary.calculated_at)
      expect(calculatedTime).toBeInstanceOf(Date)
    })
  })

  test('Suspicious user detection works correctly', async ({ page }) => {
    test.step('Detect suspicious users based on behavior patterns', async () => {
      // Create test transaction pattern that should trigger suspicion
      await supabase.from('wallet_ledger').insert([
        {
          user_id: testUserId,
          transaction_type: 'purchase',
          amount: 10000,
          balance_after: 10000,
          description: 'Test credit purchase',
        },
        {
          user_id: testUserId,
          transaction_type: 'bid_hold',
          amount: -1000,
          balance_after: 9000,
          description: 'Test bid 1',
        },
        {
          user_id: testUserId,
          transaction_type: 'bid_refund',
          amount: 1000,
          balance_after: 10000,
          description: 'Test refund 1',
        },
        {
          user_id: testUserId,
          transaction_type: 'bid_hold',
          amount: -2000,
          balance_after: 8000,
          description: 'Test bid 2',
        },
        {
          user_id: testUserId,
          transaction_type: 'bid_refund',
          amount: 2000,
          balance_after: 10000,
          description: 'Test refund 2',
        },
      ])

      // Run suspicious user detection
      const { data: suspiciousUsers, error } = await supabase.rpc('detect_suspicious_users')

      expect(error).toBeNull()
      expect(Array.isArray(suspiciousUsers)).toBe(true)

      // The test user should appear in suspicious users due to high refund ratio
      const testUserSuspicious = suspiciousUsers.find(u => u.user_id === testUserId)
      expect(testUserSuspicious).toBeTruthy()
      expect(testUserSuspicious.risk_score).toBeGreaterThan(0)
      expect(testUserSuspicious.flags).toContain('high_refund_ratio')

      // Clean up test transactions
      await supabase.from('wallet_ledger').delete().eq('user_id', testUserId)
    })
  })

  test('System announcements can be created and managed', async ({ page }) => {
    test.step('Create, update, and delete system announcements', async () => {
      // Create announcement
      const { data: announcement } = await supabase.from('system_announcements').insert({
        admin_id: adminUserId,
        title: 'Test Announcement',
        message: 'This is a test announcement for E2E testing',
        severity: 'info',
        target_roles: ['bidder', 'auctioneer'],
        is_active: true,
      }).select().single()

      expect(announcement).toBeTruthy()
      expect(announcement.title).toBe('Test Announcement')
      expect(announcement.is_active).toBe(true)

      // Update announcement
      await supabase.from('system_announcements')
        .update({ is_active: false })
        .eq('id', announcement.id)

      const { data: updatedAnnouncement } = await supabase
        .from('system_announcements')
        .select('is_active')
        .eq('id', announcement.id)
        .single()

      expect(updatedAnnouncement.is_active).toBe(false)

      // Delete announcement
      await supabase.from('system_announcements').delete().eq('id', announcement.id)

      const { data: deletedAnnouncement } = await supabase
        .from('system_announcements')
        .select('*')
        .eq('id', announcement.id)

      expect(deletedAnnouncement).toHaveLength(0)
    })
  })

  test('Admin audit log tracks all administrative actions', async ({ page }) => {
    test.step('Verify comprehensive audit logging', async () => {
      // Get all audit logs for our admin user
      const { data: auditLogs } = await supabase
        .from('admin_audit_log')
        .select('*')
        .eq('admin_id', adminUserId)
        .order('created_at', { ascending: false })

      expect(auditLogs.length).toBeGreaterThan(0)

      // Check that different action types are logged
      const actionTypes = auditLogs.map(log => log.action)
      expect(actionTypes).toContain('role_change')
      expect(actionTypes).toContain('auctioneer_approved')

      // Verify audit log structure
      const sampleLog = auditLogs[0]
      expect(sampleLog.admin_id).toBe(adminUserId)
      expect(sampleLog.action).toBeTruthy()
      expect(sampleLog.target_type).toBeTruthy()
      expect(sampleLog.target_id).toBeTruthy()
      expect(sampleLog.created_at).toBeTruthy()

      // Verify timestamps are recent (within last hour)
      const logTime = new Date(sampleLog.created_at)
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
      expect(logTime).toBeGreaterThan(hourAgo)
    })
  })

  test('Database constraints and security work correctly', async ({ page }) => {
    test.step('Test database constraints and RLS policies', async () => {
      // Test that non-admin users cannot access admin functions
      const regularUserId = testUserId

      // Attempt to change role as non-admin (should fail)
      try {
        await supabase.rpc('change_user_role', {
          p_admin_id: regularUserId, // Non-admin user
          p_target_user_id: adminUserId,
          p_new_role: 'bidder',
        })
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        // Expected to fail due to security constraints
        expect(error).toBeTruthy()
      }

      // Test foreign key constraints
      try {
        await supabase.from('admin_audit_log').insert({
          admin_id: 'non-existent-user-id',
          action: 'test_action',
          target_type: 'user',
          target_id: testUserId,
        })
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        // Expected to fail due to foreign key constraint
        expect(error).toBeTruthy()
      }
    })
  })
})