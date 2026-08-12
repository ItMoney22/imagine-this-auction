import { TrackingView } from '@/components/delivery/tracking-view'

export default async function TrackingPage({
  params,
  searchParams,
}: {
  params: Promise<{ trackingNumber: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { trackingNumber } = await params
  const { t } = await searchParams

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#faf8ff_0%,#f6f3ff_45%,#fdfcff_100%)] px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <TrackingView trackingNumber={trackingNumber} token={t ?? null} />
      </div>
    </main>
  )
}
