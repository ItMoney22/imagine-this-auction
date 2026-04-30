import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Crown, Trophy, Award, TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export const revalidate = 300 // 5 minutes

const TIER_BADGE: Record<string, { label: string; cls: string; Icon: typeof Crown }> = {
  gold: { label: 'Gold', cls: 'bg-amber-100 text-amber-800 border-amber-300', Icon: Crown },
  silver: { label: 'Silver', cls: 'bg-slate-100 text-slate-700 border-slate-300', Icon: Trophy },
  bronze: { label: 'Bronze', cls: 'bg-orange-100 text-orange-800 border-orange-300', Icon: Award },
}

function anonymizeName(first: string | null, last: string | null, email: string) {
  if (first) {
    return `${first}${last ? ' ' + last[0] + '.' : ''}`
  }
  const local = email.split('@')[0]
  if (local.length <= 2) return local
  return local[0] + '***' + local[local.length - 1]
}

export default async function LeaderboardPage() {
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('bidder_stats')
    .select('user_id, lots_won, lifetime_spend_cents, tier')
    .gt('lifetime_spend_cents', 0)
    .order('lifetime_spend_cents', { ascending: false })
    .limit(10)

  const userIds = (rows ?? []).map((r) => r.user_id)
  const { data: users } = userIds.length
    ? await supabase
        .from('users')
        .select('id, first_name, last_name, email, display_in_leaderboard')
        .in('id', userIds)
    : { data: [] }

  const usersById = new Map((users ?? []).map((u: any) => [u.id, u]))
  const leaderboard = (rows ?? []).map((r, idx) => {
    const u = usersById.get(r.user_id) as any
    const displayName = u?.display_in_leaderboard
      ? anonymizeName(u.first_name, u.last_name, u.email)
      : `Bidder #${String(r.user_id).slice(0, 6)}`
    return {
      rank: idx + 1,
      ...r,
      displayName,
    }
  })

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-900 text-xs font-semibold uppercase tracking-[0.2em] px-3 py-1 rounded-full border border-amber-200 mb-4">
            <TrendingUp className="h-3 w-3" />
            Top Collectors
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold text-slate-900 mb-3">
            The Whales
          </h1>
          <p className="text-lg text-slate-600 max-w-xl mx-auto">
            The biggest spenders on Imagine This this season. Updated nightly.
          </p>
        </div>

        {leaderboard.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            <Trophy className="h-10 w-10 mx-auto mb-4 text-slate-300" />
            <p>No one has won an auction yet.</p>
            <Link
              href="/lots"
              className="inline-block mt-4 text-sm font-medium text-blue-600 hover:underline"
            >
              Be the first →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((row) => {
              const tier = row.tier ? TIER_BADGE[row.tier] : null
              const Icon = tier?.Icon
              const podium = row.rank <= 3
              return (
                <div
                  key={row.user_id}
                  className={`flex items-center gap-4 rounded-2xl border bg-white px-5 py-4 transition-shadow hover:shadow-md ${
                    podium ? 'border-amber-200 shadow-sm' : 'border-slate-200'
                  }`}
                >
                  <div
                    className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-lg font-bold ${
                      row.rank === 1
                        ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30'
                        : row.rank === 2
                        ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white'
                        : row.rank === 3
                        ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {row.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 truncate">{row.displayName}</span>
                      {tier && Icon && (
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${tier.cls}`}
                        >
                          <Icon className="h-3 w-3" />
                          {tier.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {row.lots_won} {row.lots_won === 1 ? 'win' : 'wins'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-emerald-600 text-lg">
                      {formatCurrency(row.lifetime_spend_cents)}
                    </div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Lifetime</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-10 text-center text-xs text-slate-500">
          Want to be on the board? Toggle "Display in leaderboard" in your{' '}
          <Link href="/settings/notifications" className="underline hover:text-slate-700">
            settings
          </Link>
          .
        </div>
      </div>
    </div>
  )
}
