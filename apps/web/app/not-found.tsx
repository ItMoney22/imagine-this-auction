import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SearchX } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-[linear-gradient(180deg,#faf8ff_0%,#f6f3ff_45%,#fdfcff_100%)] px-4">
      <div className="mx-auto max-w-md rounded-3xl border border-white/70 bg-white/80 p-10 text-center shadow-[0_24px_60px_rgba(79,70,229,0.12)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
          <SearchX className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-3 text-sm text-slate-600">
          The page you&apos;re looking for doesn&apos;t exist, or the auction lot may have
          already ended.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild>
            <Link href="/lots">Browse Lots</Link>
          </Button>
          <Button asChild variant="ghost" className="text-slate-600 hover:text-indigo-600">
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
