'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { WalletBalance } from './wallet-balance'
import { CreditPacks } from './credit-packs'
import { TransactionHistory } from './transaction-history'
import { WalletBalance as WalletBalanceType } from '@/lib/payments/types'
import { PAYMENT_PROVIDER, PROVIDER_LABEL } from '@/lib/payments/config'
import { useToast } from '@/hooks/use-toast'
import { Wallet, CreditCard, History } from 'lucide-react'

interface WalletDashboardProps {
  user: any
}

export function WalletDashboard({ user }: WalletDashboardProps) {
  const [walletData, setWalletData] = useState<WalletBalanceType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const { toast } = useToast()

  // Handle success/error states from PaymentCloud or legacy Stripe redirect
  useEffect(() => {
    const success = searchParams.get('success')
    const cancelled = searchParams.get('cancelled')
    const sessionId = searchParams.get('session_id')
    const paymentStatus = searchParams.get('payment_status')
    const paymentReference = searchParams.get('payment_reference')

    if ((success === 'true' && sessionId) || paymentStatus === 'success') {
      toast({
        title: "Purchase Successful!",
        description: "Your credits have been added to your wallet.",
        variant: "default"
      })
    } else if (cancelled === 'true' || paymentStatus === 'cancelled') {
      toast({
        title: "Purchase Cancelled",
        description: "Your payment was cancelled. No charges were made.",
        variant: "destructive"
      })
    } else if (paymentStatus === 'pending' && paymentReference) {
      toast({
        title: "Payment Pending",
        description: `${providerLabel} is processing reference ${paymentReference}. Credits will appear once approved.`,
        variant: "default"
      })
    }
  }, [searchParams, toast])

  // Fetch wallet data
  const fetchWalletData = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/wallet/balance')
      if (!response.ok) {
        throw new Error('Failed to fetch wallet data')
      }

      const data: WalletBalanceType = await response.json()
      setWalletData(data)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallet')
      console.error('Wallet data fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWalletData()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Loading skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="space-y-2">
                <div className="h-16 bg-gray-200 rounded"></div>
                <div className="h-16 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <Wallet className="h-5 w-5 text-red-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">
              Failed to load wallet
            </h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
            <div className="mt-4">
              <button
                onClick={fetchWalletData}
                className="bg-red-600 text-white px-4 py-2 rounded-md text-sm hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!walletData) {
    return null
  }

  return (
    <div className="space-y-8">
      {/* Wallet Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Balance */}
        <div className="lg:col-span-1">
          <WalletBalance
            balance={walletData.balance}
            onRefresh={fetchWalletData}
          />
        </div>

        {/* Credit Packs */}
        <div className="lg:col-span-2">
          <CreditPacks
            currentBalance={walletData.balance}
            onPurchaseComplete={fetchWalletData}
          />
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <TransactionHistory transactions={walletData.transactions} />
      </div>
    </div>
  )
}
  const providerLabel = PROVIDER_LABEL[PAYMENT_PROVIDER]
