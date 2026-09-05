import { redirect } from 'next/navigation'

import { PaymentMethodManager } from '@/components/payments/payment-method-manager'
import { getPaymentMethodPublic, paymentMethodPagePath, sanitizeReturnPath } from '@/lib/payments/methods'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface PaymentMethodPageProps {
  searchParams?: Promise<{ next?: string | string[] }>
}

/**
 * /account/payment: the bidder's card on file. Signed-in only; a signed-out
 * visit goes to login with this page (including a valid ?next=) as the
 * return target, so "Add a card to bid" from a lot survives the sign-in.
 */
export default async function PaymentMethodPage({ searchParams }: PaymentMethodPageProps) {
  const params = await searchParams
  const rawNext = Array.isArray(params?.next) ? params?.next[0] : params?.next
  const next = sanitizeReturnPath(rawNext)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirectedFrom=${encodeURIComponent(paymentMethodPagePath(next))}`)
  }

  const [{ data: profile }, method] = await Promise.all([
    supabase.from('users').select('first_name, last_name').eq('id', user.id).maybeSingle(),
    getPaymentMethodPublic(supabase, user.id).catch((error: unknown) => {
      // A missing table (migration 020 not yet applied) must not take the page down.
      console.error('[account/payment] could not load payment method', error)
      return null
    }),
  ])

  const names = (profile ?? null) as { first_name?: string | null; last_name?: string | null } | null
  const tokenizationKey = process.env.NEXT_PUBLIC_NMI_TOKENIZATION_KEY?.trim() || null

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Payment method</h1>
          <p className="text-gray-600">
            Keep one card on file to bid. You are charged the hammer price plus the auctioneer&apos;s buyer&apos;s
            premium only when you win a lot.
          </p>
        </div>

        <PaymentMethodManager
          initialMethod={method}
          tokenizationKey={tokenizationKey}
          defaultFirstName={names?.first_name ?? null}
          defaultLastName={names?.last_name ?? null}
          next={next}
        />
      </div>
    </main>
  )
}
