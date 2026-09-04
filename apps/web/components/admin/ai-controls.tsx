'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Coins,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn, formatDate, formatITC } from '@/lib/utils'

interface PriceRow {
  action_key: string
  label: string
  description: string | null
  category: 'listing' | 'image'
  credit_cost: number
  is_enabled: boolean
  rate_limit_per_hour: number
  provider: string | null
  model: string | null
  usage_30d?: { charged: number; credits: number; refunded: number }
}

interface LedgerEntry {
  id: string
  user_id: string
  action_key: string
  credit_cost: number
  status: string
  draft_id: string | null
  lot_id: string | null
  provider: string | null
  provider_job_id: string | null
  refunded_at: string | null
  refund_reason: string | null
  failure_reason: string | null
  created_at: string
  users?: { email?: string | null } | null
}

const STATUS_STYLES: Record<string, string> = {
  charged: 'bg-emerald-100 text-emerald-800',
  refunded: 'bg-amber-100 text-amber-800',
  voided: 'bg-slate-100 text-slate-600',
  failed: 'bg-rose-100 text-rose-700',
  pending: 'bg-blue-100 text-blue-700',
}

/**
 * Admin control panel for AI Quick Listing: per-action credit prices, on/off
 * switches, rate limits, and the full spend/refund audit trail.
 */
export function AiControls() {
  const [prices, setPrices] = useState<PriceRow[]>([])
  const [draftPrices, setDraftPrices] = useState<Record<string, Partial<PriceRow>>>({})
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [summary, setSummary] = useState<Record<string, number> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refunding, setRefunding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [pricingResponse, ledgerResponse] = await Promise.all([
        fetch('/api/admin/ai/pricing'),
        fetch('/api/admin/ai/ledger?limit=100'),
      ])

      const pricingData = await pricingResponse.json()
      const ledgerData = await ledgerResponse.json()

      if (!pricingResponse.ok) throw new Error(pricingData.error ?? 'Failed to load pricing')
      if (!ledgerResponse.ok) throw new Error(ledgerData.error ?? 'Failed to load ledger')

      setPrices(pricingData.prices ?? [])
      setDraftPrices({})
      setLedger(ledgerData.entries ?? [])
      setSummary(ledgerData.summary_30d ?? null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load AI controls')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const stage = (actionKey: string, patch: Partial<PriceRow>) => {
    setDraftPrices((current) => ({
      ...current,
      [actionKey]: { ...current[actionKey], ...patch },
    }))
  }

  const dirtyKeys = Object.keys(draftPrices)

  const save = async () => {
    if (dirtyKeys.length === 0) return

    setSaving(true)
    setError(null)
    setNotice(null)

    try {
      const response = await fetch('/api/admin/ai/pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: dirtyKeys.map((key) => ({ action_key: key, ...draftPrices[key] })),
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Failed to save prices')

      setPrices(data.prices ?? [])
      setDraftPrices({})
      setNotice('AI prices updated. New prices apply to the next action immediately.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save prices')
    } finally {
      setSaving(false)
    }
  }

  const refund = async (entry: LedgerEntry) => {
    const reason = window.prompt(
      `Refund ${entry.credit_cost} ITC for "${entry.action_key}"?\n\nReason (recorded in the ledger):`
    )
    if (!reason?.trim()) return

    setRefunding(entry.id)
    setError(null)

    try {
      const response = await fetch('/api/admin/ai/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ledger_id: entry.id, reason: reason.trim() }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Refund failed')

      setNotice(`Refunded ${formatITC(entry.credit_cost)}.`)
      await load()
    } catch (refundError) {
      setError(refundError instanceof Error ? refundError.message : 'Refund failed')
    } finally {
      setRefunding(null)
    }
  }

  const valueOf = (row: PriceRow, key: keyof PriceRow) =>
    (draftPrices[row.action_key]?.[key] ?? row[key]) as never

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading AI controls…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {/* Pricing */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-amber-600" />
                AI credit prices
              </CardTitle>
              <CardDescription>
                Per-action ITC cost, availability and hourly rate limits. Changes take effect on the
                next AI action — no deploy needed.
              </CardDescription>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load} disabled={saving}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button size="sm" onClick={save} disabled={saving || dirtyKeys.length === 0}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save {dirtyKeys.length > 0 ? `(${dirtyKeys.length})` : ''}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {prices.map((row) => (
            <div
              key={row.action_key}
              className={cn(
                'grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_auto]',
                draftPrices[row.action_key] ? 'border-indigo-400 bg-indigo-50/40' : 'border-slate-200'
              )}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">{row.label}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {row.category}
                  </Badge>
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                    {row.action_key}
                  </code>
                </div>
                {row.description && (
                  <p className="text-xs text-slate-500">{row.description}</p>
                )}
                {row.usage_30d && (
                  <p className="text-[11px] text-slate-400">
                    30d: {row.usage_30d.charged} charged · {formatITC(row.usage_30d.credits)} ·{' '}
                    {row.usage_30d.refunded} refunded
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="whitespace-nowrap">ITC</span>
                  <Input
                    type="number"
                    min={0}
                    max={100000}
                    value={valueOf(row, 'credit_cost')}
                    onChange={(event) =>
                      stage(row.action_key, { credit_cost: Number(event.target.value) })
                    }
                    className="h-8 w-20"
                  />
                </label>

                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="whitespace-nowrap">/hr</span>
                  <Input
                    type="number"
                    min={1}
                    max={10000}
                    value={valueOf(row, 'rate_limit_per_hour')}
                    onChange={(event) =>
                      stage(row.action_key, { rate_limit_per_hour: Number(event.target.value) })
                    }
                    className="h-8 w-20"
                  />
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <Switch
                    checked={valueOf(row, 'is_enabled')}
                    onCheckedChange={(checked) => stage(row.action_key, { is_enabled: checked })}
                  />
                  {valueOf(row, 'is_enabled') ? 'On' : 'Off'}
                </label>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            AI credit ledger
          </CardTitle>
          <CardDescription>
            Every AI action: user, cost, target listing, provider job ID, status and refunds.
          </CardDescription>

          {summary && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{summary.charged} charged (30d)</Badge>
              <Badge variant="secondary">{formatITC(summary.net_credits)} spent</Badge>
              <Badge variant="outline">{summary.refunded} refunded</Badge>
              <Badge variant="outline">{summary.voided} voided/failed</Badge>
              {summary.pending > 0 && <Badge variant="outline">{summary.pending} pending</Badge>}
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">When</th>
                  <th className="px-4 py-2 font-semibold">User</th>
                  <th className="px-4 py-2 font-semibold">Action</th>
                  <th className="px-4 py-2 font-semibold">Cost</th>
                  <th className="px-4 py-2 font-semibold">Target</th>
                  <th className="px-4 py-2 font-semibold">Provider job</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      No AI actions recorded yet.
                    </td>
                  </tr>
                ) : (
                  ledger.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                        {formatDate(entry.created_at)}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2 text-xs">
                        {entry.users?.email ?? entry.user_id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-2 text-xs">{entry.action_key}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs font-semibold">
                        {entry.credit_cost} ITC
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {entry.lot_id
                          ? `lot ${entry.lot_id.slice(0, 8)}`
                          : entry.draft_id
                            ? `draft ${entry.draft_id.slice(0, 8)}`
                            : '—'}
                      </td>
                      <td className="max-w-[140px] truncate px-4 py-2 text-xs text-slate-400">
                        {entry.provider_job_id ?? '—'}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            STATUS_STYLES[entry.status] ?? 'bg-slate-100 text-slate-600'
                          )}
                          title={entry.refund_reason ?? entry.failure_reason ?? undefined}
                        >
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {entry.status === 'charged' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refund(entry)}
                            disabled={refunding === entry.id}
                            className="h-7 text-xs"
                          >
                            {refunding === entry.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="mr-1 h-3 w-3" />
                            )}
                            Refund
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default AiControls
