'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, CreditCard, ShieldAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CardOnFileForm } from '@/components/payments/card-on-file-form'
import { WorkingBar } from '@/components/payments/working-bar'
import { useToast } from '@/hooks/use-toast'
import type { PaymentMethodPublic } from '@/lib/payments/methods'

interface PaymentMethodManagerProps {
  initialMethod: PaymentMethodPublic | null
  tokenizationKey: string | null
  defaultFirstName?: string | null
  defaultLastName?: string | null
  /** Already validated by the server page: a same-site path to return to after saving, or null. */
  next: string | null
}

const BRAND_NAMES: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  maestro: 'Maestro',
}

export function formatCardBrand(brand: string | null | undefined): string {
  if (!brand) return 'Card'
  const key = brand.trim().toLowerCase()
  return BRAND_NAMES[key] ?? brand.charAt(0).toUpperCase() + brand.slice(1)
}

export function formatCardExpiry(month: number | null | undefined, year: number | null | undefined): string | null {
  if (!month || !year) return null
  return `${String(month).padStart(2, '0')}/${year}`
}

/**
 * The bidder's card on file: shows the current card with Replace / Remove, or
 * the Collect.js form when there is none (or while replacing). After a save,
 * honours `next` so a bidder who came from a lot lands back on it.
 */
export function PaymentMethodManager({
  initialMethod,
  tokenizationKey,
  defaultFirstName,
  defaultLastName,
  next,
}: PaymentMethodManagerProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [method, setMethod] = useState<PaymentMethodPublic | null>(initialMethod)
  const [replacing, setReplacing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const handleSaved = (saved: PaymentMethodPublic) => {
    setMethod(saved)
    setReplacing(false)
    toast({
      title: 'Card saved',
      description: `${formatCardBrand(saved.brand)} ending in ${saved.last4 ?? '••••'} is verified and ready to bid.`,
    })
    if (next) router.push(next)
  }

  const handleRemove = async () => {
    setRemoving(true)
    setRemoveError(null)
    try {
      const res = await fetch('/api/payments/methods', { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Could not remove your card.')
      }
      setMethod(null)
      toast({ title: 'Card removed', description: 'Add a card again before your next bid.' })
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : 'Could not remove your card.')
    } finally {
      setRemoving(false)
    }
  }

  const showForm = !method || replacing

  return (
    <div className="space-y-6">
      {method && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-indigo-600" aria-hidden="true" />
              Card on file
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {formatCardBrand(method.brand)} •••• {method.last4 ?? '••••'}
                </p>
                {formatCardExpiry(method.expMonth, method.expYear) && (
                  <p className="text-sm text-slate-600">Expires {formatCardExpiry(method.expMonth, method.expYear)}</p>
                )}
              </div>
              {method.verified ? (
                <Badge className="w-fit gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Verified
                </Badge>
              ) : (
                <Badge variant="destructive" className="w-fit gap-1">
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  Not verified
                </Badge>
              )}
            </div>

            {!method.verified && (
              <p className="text-sm text-amber-900">
                The bank did not confirm this card, so it cannot be used to bid. Replace it with another card.
              </p>
            )}

            <p className="text-sm text-slate-600">
              This card is charged the hammer price plus the auctioneer&apos;s buyer&apos;s premium only when you win.
            </p>

            {removing && <WorkingBar label="Removing your card…" />}
            {removeError && (
              <p role="alert" className="text-sm text-red-700">
                {removeError}
              </p>
            )}

            {!replacing && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => setReplacing(true)} disabled={removing}>
                  Replace card
                </Button>
                <Button type="button" variant="outline" onClick={handleRemove} disabled={removing}>
                  Remove card
                </Button>
                {next && method.verified && (
                  <Button asChild variant="ghost">
                    <Link href={next}>
                      <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                      Back to the lot
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{method ? 'Enter a new card' : 'Add a card to bid'}</CardTitle>
          </CardHeader>
          <CardContent>
            <CardOnFileForm
              tokenizationKey={tokenizationKey}
              defaultFirstName={defaultFirstName}
              defaultLastName={defaultLastName}
              onSaved={handleSaved}
              onCancel={method ? () => setReplacing(false) : undefined}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
