'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CREDIT_PACKS, formatPrice, PAYMENT_PROVIDER, PROVIDER_LABEL } from '@/lib/payments/config'
import { CreditPackId } from '@/lib/payments/config'
import { CardPaymentResponse } from '@/lib/payments/types'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'
import { CreditCard, Zap, Star, Crown, Loader2 } from 'lucide-react'

interface CreditPacksProps {
  currentBalance: number
  onPurchaseComplete: () => Promise<void>
}

const PACK_ICONS = {
  pack_100: Zap,
  pack_275: Star,
  pack_600: Crown,
  pack_1300: Crown,
} as const

const PACK_COLORS = {
  pack_100: 'border-blue-200 hover:border-blue-300',
  pack_275: 'border-green-200 hover:border-green-300 ring-2 ring-green-100',
  pack_600: 'border-purple-200 hover:border-purple-300',
  pack_1300: 'border-yellow-200 hover:border-yellow-300',
} as const

export function CreditPacks({ currentBalance, onPurchaseComplete }: CreditPacksProps) {
  const [purchasing, setPurchasing] = useState<CreditPackId | null>(null)
  const { toast } = useToast()
  const providerLabel = PROVIDER_LABEL[PAYMENT_PROVIDER]

  const handlePurchase = async (packId: CreditPackId) => {
    setPurchasing(packId)

    try {
      const response = await fetch('/api/payments/card/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ packId }),
      })

      const data: CardPaymentResponse = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to create checkout session')
      }

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl
        return
      }

      if (data.status === 'pending') {
        toast({
          title: 'Payment Pending',
          description: data.paymentReference
            ? `${providerLabel} is processing reference ${data.paymentReference}. You will receive an email once credits are available.`
            : `${providerLabel} is processing your card. You will receive an email once credits are available.`,
        })
        setPurchasing(null)
        await onPurchaseComplete()
        return
      }

      throw new Error('Payment provider did not return a redirect URL or pending status')

    } catch (error) {
      console.error('Purchase error:', error)
      toast({
        title: "Purchase Failed",
        description: error instanceof Error ? error.message : "Something went wrong. Please try again.",
        variant: "destructive"
      })
      setPurchasing(null)
    }
  }

  const getBonusText = (packId: CreditPackId) => {
    switch (packId) {
      case 'pack_275':
        return '+25 Bonus'
      case 'pack_600':
        return '+100 Bonus'
      case 'pack_1300':
        return '+300 Bonus'
      default:
        return null
    }
  }

  const isPopular = (packId: CreditPackId) => packId === 'pack_275'
  const isBestValue = (packId: CreditPackId) => packId === 'pack_600'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <CreditCard className="h-5 w-5 mr-2 text-green-600" />
          Buy Credit Packs
        </CardTitle>
        <p className="text-sm text-gray-600">
          Purchase ITC credits to participate in auctions
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(CREDIT_PACKS).map(([packId, pack]) => {
            const IconComponent = PACK_ICONS[packId as CreditPackId]
            const colorClass = PACK_COLORS[packId as CreditPackId]
            const bonusText = getBonusText(packId as CreditPackId)
            const isPurchasing = purchasing === packId

            return (
              <div
                key={packId}
                data-testid={`credit-pack-${packId.replace('pack_', '')}`}
                className={`relative border rounded-lg p-4 transition-all duration-200 ${colorClass} ${
                  isPurchasing ? 'opacity-75' : 'hover:shadow-md'
                }`}
              >
                {/* Popular badge */}
                {isPopular(packId as CreditPackId) && (
                  <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-green-600 text-white">
                      Most Popular
                    </Badge>
                  </div>
                )}

                {/* Best value badge */}
                {isBestValue(packId as CreditPackId) && (
                  <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-purple-600 text-white">
                      Best Value
                    </Badge>
                  </div>
                )}

                <div className="text-center space-y-3">
                  {/* Icon and title */}
                  <div className="flex items-center justify-center">
                    <IconComponent className="h-6 w-6 text-blue-600 mr-2" />
                    <h3 className="font-semibold text-gray-900">
                      {formatCurrency(pack.amount)}
                    </h3>
                  </div>

                  {/* Bonus text */}
                  {bonusText && (
                    <div className="text-sm font-medium text-green-600">
                      {bonusText}
                    </div>
                  )}

                  {/* Price */}
                  <div className="text-2xl font-bold text-gray-900">
                    {formatPrice(pack.price)}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-600">
                    {pack.description}
                  </p>

                  {/* Value indicator */}
                  <div className="text-xs text-gray-500">
                    {(pack.price / pack.amount / 100).toFixed(3)}¢ per ITC
                  </div>

                  {/* Purchase button */}
                  <Button
                    onClick={() => handlePurchase(packId as CreditPackId)}
                    disabled={isPurchasing}
                    className="w-full"
                    size="sm"
                    aria-label={`Buy ${pack.name} with ${providerLabel}`}
                  >
                    {isPurchasing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4 mr-2" />
                        Buy Now
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Additional info */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>Secure payment via {providerLabel} (activation pending)</span>
              <span className="text-green-600">✓</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Instant credit delivery</span>
              <span className="text-green-600">✓</span>
            </div>
            <div className="flex items-center justify-between">
              <span>30-day refund policy</span>
              <span className="text-green-600">✓</span>
            </div>
          </div>
        </div>

        {/* Current balance reminder */}
        {currentBalance > 0 && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              💡 Your current balance of {formatCurrency(currentBalance)} will be combined with your new purchase.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
