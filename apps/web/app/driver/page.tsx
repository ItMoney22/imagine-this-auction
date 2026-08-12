import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { DriverJobs } from '@/components/delivery/driver-jobs'

export default async function DriverHomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirectedFrom=/driver')

  const { data: profile } = await supabase
    .from('users')
    .select('role, first_name')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'driver') redirect('/')

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#faf8ff_0%,#f6f3ff_45%,#fdfcff_100%)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-3xl text-slate-950">
          Driver Dashboard{profile.first_name ? ` — ${profile.first_name}` : ''}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Claim offers, run deliveries, and report issues from here.
        </p>
        <div className="mt-6">
          <DriverJobs />
        </div>
      </div>
    </main>
  )
}
