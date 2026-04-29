'use client'

import { useEffect, useMemo, useState } from 'react'
import { Save, Sparkles } from 'lucide-react'

import {
  AI_DESCRIPTION_STYLES,
  DEFAULT_AI_PREFERENCES,
  type AiPreferences,
} from '@/lib/ai/listing-assistant'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

interface AiAssistantSettingsProps {
  auctioneerId: string
  initialPreferences?: AiPreferences
  onSaved?: (preferences: AiPreferences) => void
}

export function AiAssistantSettings({
  auctioneerId,
  initialPreferences = DEFAULT_AI_PREFERENCES,
  onSaved,
}: AiAssistantSettingsProps) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [baselinePreferences, setBaselinePreferences] =
    useState<AiPreferences>(initialPreferences)
  const [preferences, setPreferences] = useState<AiPreferences>(initialPreferences)

  useEffect(() => {
    setPreferences(initialPreferences)
    setBaselinePreferences(initialPreferences)
  }, [initialPreferences])

  const isDirty = useMemo(
    () => JSON.stringify(preferences) !== JSON.stringify(baselinePreferences),
    [baselinePreferences, preferences]
  )

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSavedMessage(null)

    try {
      const { error: updateError } = await supabase
        .from('auctioneers')
        .update({ ai_preferences: preferences })
        .eq('id', auctioneerId)

      if (updateError) {
        throw updateError
      }

      setSavedMessage('Preferences saved')
      setBaselinePreferences(preferences)
      onSaved?.(preferences)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save AI settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="overflow-hidden border-indigo-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.14),_transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,244,255,0.92))]">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge className="gap-1 bg-gradient-to-r from-[#4c1d95] to-[#7c3aed] text-white">
                <Sparkles className="h-3 w-3" />
                AI Assistant
              </Badge>
              {preferences.enabled ? (
                <Badge variant="secondary">Enabled</Badge>
              ) : (
                <Badge variant="outline">Disabled</Badge>
              )}
            </div>
            <CardTitle className="text-xl">Listing Assistant Settings</CardTitle>
            <CardDescription>
              Opt in per account and define how catalog copy should sound before it
              reaches your lot form.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/60 bg-white/70 p-4">
          <div className="space-y-1">
            <Label htmlFor="ai-enabled" className="text-sm font-semibold text-slate-900">
              Enable AI listing assistant
            </Label>
            <p className="text-sm text-slate-500">
              Auctioneers can request AI-generated titles, descriptions, estimates,
              and condition notes while drafting lots.
            </p>
          </div>
          <Switch
            id="ai-enabled"
            checked={preferences.enabled}
            onCheckedChange={(checked) =>
              setPreferences((current) => ({ ...current, enabled: checked }))
            }
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label htmlFor="ai-style">Description style</Label>
            <Select
              value={preferences.descriptionStyle}
              onValueChange={(value: AiPreferences['descriptionStyle']) =>
                setPreferences((current) => ({
                  ...current,
                  descriptionStyle: value,
                }))
              }
            >
              <SelectTrigger id="ai-style">
                <SelectValue placeholder="Choose a style" />
              </SelectTrigger>
              <SelectContent>
                {AI_DESCRIPTION_STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {style}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-notes">House style notes</Label>
            <Textarea
              id="ai-notes"
              value={preferences.customNotes}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  customNotes: event.target.value.slice(0, 1000),
                }))
              }
              placeholder="Example: Mention measurements when visible, avoid firm attributions without signatures, and keep estimates conservative."
              rows={5}
            />
            <p className="text-xs text-slate-500">
              {preferences.customNotes.length}/1000 characters
            </p>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {savedMessage ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {savedMessage}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !isDirty}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
