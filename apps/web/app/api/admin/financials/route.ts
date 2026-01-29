import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow, createServiceRoleClient } from '@/lib/api/admin-auth'

export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const { user } = await assertAdminOrThrow(request)
    console.log('Admin financials request by:', user.email, 'User ID:', user.id)

    // Use service role client for admin operations
    const supabase = createServiceRoleClient()

    // Get financial summary using the database function
    const { data: summary, error: summaryError } = await supabase
      .rpc('get_financial_summary')

    if (summaryError) {
      console.error('Failed to get financial summary:', {
        error: summaryError,
        userId: user.id,
        email: user.email,
        timestamp: new Date().toISOString()
      })
      return NextResponse.json(
        {
          error: 'Failed to get financial summary',
          hint: 'Database function get_financial_summary may not exist'
        },
        { status: 500 }
      )
    }

    // Get additional detailed metrics
    const { data: recentTransactions } = await supabase
      .from('wallet_ledger')
      .select(`
        id,
        transaction_type,
        amount,
        description,
        created_at,
        user:users!user_id(
          email,
          first_name,
          last_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(20)

    const { data: recentInvoices } = await supabase
      .from('invoices')
      .select(`
        id,
        total_amount,
        is_paid,
        is_shipped,
        created_at,
        buyer:users!buyer_id(
          email,
          first_name,
          last_name
        ),
        lot:lots!lot_id(
          title,
          lot_number,
          auction:auctions!auction_id(
            title
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(20)

    const { data: recentPayouts } = await supabase
      .from('payouts_due')
      .select(`
        id,
        amount,
        platform_commission,
        is_paid,
        created_at,
        auctioneer:auctioneers!auctioneer_id(
          company_name
        ),
        invoice:invoices!invoice_id(
          lot:lots!lot_id(
            title,
            lot_number
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(20)

    // Calculate period-over-period growth
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: recentCredits } = await supabase
      .from('wallet_ledger')
      .select('amount, created_at')
      .eq('transaction_type', 'purchase')
      .gte('created_at', thirtyDaysAgo.toISOString())

    const { data: recentEscrowReleases } = await supabase
      .from('wallet_ledger')
      .select('amount, created_at')
      .eq('transaction_type', 'escrow_release')
      .gte('created_at', thirtyDaysAgo.toISOString())

    const last30DaysCredits = recentCredits?.reduce((sum, t) => sum + t.amount, 0) || 0
    const last30DaysReleases = recentEscrowReleases?.length || 0

    return NextResponse.json({
      summary,
      metrics: {
        last_30_days: {
          credits_purchased: last30DaysCredits,
          transactions_completed: last30DaysReleases,
        }
      },
      recent_activity: {
        transactions: recentTransactions || [],
        invoices: recentInvoices || [],
        payouts: recentPayouts || [],
      }
    })

  } catch (error) {
    console.error('Admin financials API error:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      request_url: request.url
    })
    return NextResponse.json(
      {
        error: 'Internal server error',
        hint: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}