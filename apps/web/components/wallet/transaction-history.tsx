'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { WalletTransaction } from '@/lib/payments/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  History,
  Plus,
  Minus,
  RefreshCw,
  Lock,
  Unlock,
  CreditCard,
  Gavel
} from 'lucide-react'

interface TransactionHistoryProps {
  transactions: WalletTransaction[]
}

const TRANSACTION_ICONS = {
  purchase: CreditCard,
  bid_hold: Gavel,
  bid_refund: RefreshCw,
  escrow_hold: Lock,
  escrow_release: Unlock,
} as const

const TRANSACTION_COLORS = {
  purchase: 'text-green-600 bg-green-50 border-green-200',
  bid_hold: 'text-red-600 bg-red-50 border-red-200',
  bid_refund: 'text-blue-600 bg-blue-50 border-blue-200',
  escrow_hold: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  escrow_release: 'text-green-600 bg-green-50 border-green-200',
} as const

export function TransactionHistory({ transactions }: TransactionHistoryProps) {
  const getAmountDisplay = (transaction: WalletTransaction) => {
    const isCredit = ['purchase', 'bid_refund', 'escrow_release'].includes(transaction.type)
    const icon = isCredit ? Plus : Minus
    const color = isCredit ? 'text-green-600' : 'text-red-600'

    return (
      <div className={`flex items-center ${color} font-medium`}>
        {React.createElement(icon, { className: 'h-4 w-4 mr-1' })}
        {formatCurrency(transaction.amount_itc)}
      </div>
    )
  }

  const getTransactionBadge = (type: WalletTransaction['type']) => {
    const labels = {
      purchase: 'Purchase',
      bid_hold: 'Bid Placed',
      bid_refund: 'Bid Refund',
      escrow_hold: 'Escrow Hold',
      escrow_release: 'Escrow Release',
    }

    const colors = {
      purchase: 'default',
      bid_hold: 'destructive',
      bid_refund: 'secondary',
      escrow_hold: 'outline',
      escrow_release: 'default',
    } as const

    return (
      <Badge variant={colors[type]}>
        {labels[type]}
      </Badge>
    )
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <History className="h-5 w-5 mr-2 text-gray-600" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No transactions yet
            </h3>
            <p className="text-gray-600">
              Your transaction history will appear here after you make your first purchase or place a bid.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card data-testid="transaction-history">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <History className="h-5 w-5 mr-2 text-gray-600" />
            Transaction History
          </div>
          <Badge variant="secondary">
            {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {transactions.map((transaction) => {
            const IconComponent = TRANSACTION_ICONS[transaction.type]
            const colorClass = TRANSACTION_COLORS[transaction.type]

            return (
              <div
                key={transaction.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  {/* Icon */}
                  <div className={`p-2 rounded-full border ${colorClass}`}>
                    <IconComponent className="h-4 w-4" />
                  </div>

                  {/* Transaction details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      {getTransactionBadge(transaction.type)}
                    </div>

                    <p className="text-sm font-medium text-gray-900">
                      {transaction.description || 'Transaction'}
                    </p>

                    <p className="text-xs text-gray-500">
                      {formatDate(transaction.created_at)}
                    </p>

                    {/* Reference info */}
                    {transaction.ref_table && transaction.ref_id && (
                      <p className="text-xs text-gray-400 mt-1">
                        Ref: {transaction.ref_table}#{transaction.ref_id.slice(0, 8)}...
                      </p>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div className="text-right">
                  {getAmountDisplay(transaction)}
                </div>
              </div>
            )
          })}
        </div>

        {/* Show load more if there are many transactions */}
        {transactions.length >= 20 && (
          <div className="mt-4 text-center">
            <button className="text-sm text-blue-600 hover:text-blue-800">
              Load more transactions
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
