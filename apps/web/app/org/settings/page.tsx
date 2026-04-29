import { redirect } from 'next/navigation'

import { normalizeAiPreferences } from '@/lib/ai/listing-assistant'
import { createClient } from '@/lib/supabase/server'
import { AiAssistantSettings } from '@/components/org/ai-assistant-settings'

export default async function OrgSettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'auctioneer') {
    redirect('/dashboard')
  }

  const { data: auctioneer } = await supabase
    .from('auctioneers')
    .select('id, company_name, ai_preferences')
    .eq('user_id', user.id)
    .single()

  if (!auctioneer) {
    redirect('/org')
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-4xl text-slate-950">AI Assistant Settings</h1>
        <p className="text-sm text-slate-600">
          Configure how {auctioneer.company_name} uses AI when drafting new auction lots.
        </p>
      </div>

      <AiAssistantSettings
        auctioneerId={auctioneer.id}
        initialPreferences={normalizeAiPreferences(auctioneer.ai_preferences)}
      />
    </div>
  )
}
