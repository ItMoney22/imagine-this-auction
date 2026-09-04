import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { AiControls } from '@/components/admin/ai-controls'

export const dynamic = 'force-dynamic'

export default async function AdminAiPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') redirect('/')

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Admin
          </Link>
        </Button>

        <div>
          <h1 className="text-3xl font-bold text-slate-900">AI Quick Listing Controls</h1>
          <p className="mt-1 text-sm text-slate-600">
            Set what each AI action costs in ITC, turn actions on or off, cap usage, and audit every
            credit charged or refunded.
          </p>
        </div>
      </div>

      <AiControls />
    </div>
  )
}
