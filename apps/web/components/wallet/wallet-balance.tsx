'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Wallet, RefreshCw } from 'lucide-react'
import { useState } from 'react'

interface WalletBalanceProps {
  balance: number
  onRefresh: () => Promise<void>
}

export function WalletBalance({ balance, onRefresh }: WalletBalanceProps) {
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Card data-testid="wallet-balance">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <Wallet className="h-5 w-5 mr-2 text-blue-600" />
            Current Balance
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            data-testid="refresh-balance"
            aria-label="Refresh wallet balance"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center">
          <div className="text-4xl font-bold text-blue-600 mb-2">
            {formatCurrency(balance)}
          </div>
          <p className="text-sm text-gray-600">
            Available for bidding
          </p>
        </div>

        {balance === 0 && (
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
            <p className="text-sm text-yellow-800">
              You don't have any credits yet. Purchase a credit pack to start bidding!
            </p>
          </div>
        )}

        {balance > 0 && balance < 50 && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              Your balance is getting low. Consider adding more credits to continue bidding.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
