import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { walletEntryDelta, walletEntryLabel } from '@/lib/wallet/balance'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get all wallet transactions for the user
    const { data: transactions, error: transactionsError } = await supabase
      .from('wallet_ledger')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (transactionsError) {
      console.error('Failed to fetch wallet transactions:', transactionsError)
      return NextResponse.json(
        { error: 'Failed to fetch wallet balance' },
        { status: 500 }
      )
    }

    // Calculate balance using the shared sign table so every transaction type
    // (including AI spend/refund) is accounted for in exactly one place.
    let balance = 0
    const processedTransactions = []

    for (const transaction of transactions || []) {
      const description =
        transaction.description || walletEntryLabel(transaction.transaction_type)

      balance += walletEntryDelta(transaction)

      processedTransactions.push({
        id: transaction.id,
        type: transaction.transaction_type,
        amount_itc: transaction.amount,
        balance_after: transaction.balance_after,
        created_at: transaction.created_at,
        ref_id: transaction.reference_id,
        ref_table: transaction.reference_type,
        description,
      })
    }

    return NextResponse.json({
      balance,
      transactions: processedTransactions,
    })

  } catch (error) {
    console.error('Wallet balance API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
