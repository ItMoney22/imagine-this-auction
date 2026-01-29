import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { WalletBalance, WalletTransaction } from '@/lib/payments/types'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // TEMPORARY: Skip auth for development
    // const {
    //   data: { user },
    //   error: authError,
    // } = await supabase.auth.getUser()

    // if (authError || !user) {
    //   return NextResponse.json(
    //     { error: 'Authentication required' },
    //     { status: 401 }
    //   )
    // }

    // TEMPORARY: Use dummy transactions for development
    const transactions = [
      {
        id: 'tx1',
        type: 'purchase',
        amount_itc: 1000,
        created_at: new Date().toISOString(),
        ref_table: 'payment_events',
        ref_id: 'dummy-session',
        description: 'Initial credit purchase'
      },
      {
        id: 'tx2',
        type: 'bid_spend',
        amount_itc: 50,
        created_at: new Date(Date.now() - 86400000).toISOString(),
        ref_table: 'bids',
        ref_id: 'dummy-bid',
        description: 'Bid on vintage watch'
      }
    ]
    const transactionsError = null

    // Get all wallet transactions for the user
    // const { data: transactions, error: transactionsError } = await supabase
    //   .from('wallet_ledger')
    //   .select('*')
    //   .eq('user_id', user.id)
    //   .order('created_at', { ascending: false })

    if (transactionsError) {
      console.error('Failed to fetch wallet transactions:', transactionsError)
      return NextResponse.json(
        { error: 'Failed to fetch wallet balance' },
        { status: 500 }
      )
    }

    // Calculate balance
    let balance = 0
    const processedTransactions: WalletTransaction[] = []

    for (const transaction of transactions || []) {
      let description = transaction.description || ''

      switch (transaction.type) {
        case 'purchase':
        case 'bid_refund':
        case 'escrow_release':
          balance += transaction.amount_itc
          if (!description) {
            description = transaction.type === 'purchase'
              ? 'Credit purchase'
              : transaction.type === 'bid_refund'
              ? 'Bid refund'
              : 'Escrow release'
          }
          break

        case 'bid_spend':
        case 'escrow_hold':
          balance -= transaction.amount_itc
          if (!description) {
            description = transaction.type === 'bid_spend'
              ? 'Bid placed'
              : 'Escrow hold'
          }
          break

        default:
          console.warn(`Unknown wallet transaction type: ${transaction.type}`)
      }

      processedTransactions.push({
        id: transaction.id,
        type: transaction.type,
        amount_itc: transaction.amount_itc,
        created_at: transaction.created_at,
        ref_table: transaction.ref_table,
        ref_id: transaction.ref_id,
        description,
      })
    }

    const walletBalance: WalletBalance = {
      balance,
      transactions: processedTransactions,
    }

    return NextResponse.json(walletBalance)

  } catch (error) {
    console.error('Wallet balance API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
