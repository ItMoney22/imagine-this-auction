import { z } from 'zod'

export const AI_DESCRIPTION_STYLES = [
  'Detailed Catalog',
  'Concise & Punchy',
  'Collector-Focused',
] as const

export const AiPreferencesSchema = z.object({
  enabled: z.boolean().default(false),
  descriptionStyle: z.enum(AI_DESCRIPTION_STYLES).default('Detailed Catalog'),
  customNotes: z.string().max(1000).default(''),
})

export type AiPreferences = z.infer<typeof AiPreferencesSchema>

export const DEFAULT_AI_PREFERENCES: AiPreferences = {
  enabled: false,
  descriptionStyle: 'Detailed Catalog',
  customNotes: '',
}

export function normalizeAiPreferences(value: unknown): AiPreferences {
  const parsed = AiPreferencesSchema.safeParse(value)
  if (!parsed.success) {
    return DEFAULT_AI_PREFERENCES
  }

  return {
    enabled: parsed.data.enabled,
    descriptionStyle: parsed.data.descriptionStyle,
    customNotes: parsed.data.customNotes ?? '',
  }
}

export const AiListingAssistantRequestSchema = z.object({
  imageUrls: z.array(z.string().url()).min(1).max(8),
  manualContext: z.string().trim().max(1000).optional(),
})

export const AiListingAssistantResponseSchema = z
  .object({
    title: z.string().min(1).max(80),
    description: z.string().min(1),
    category: z.string().min(1),
    condition_report: z.string().min(1),
    provenance_suggestion: z.string().min(1),
    estimate_low: z.number().int().nonnegative(),
    estimate_high: z.number().int().nonnegative(),
    keywords: z.array(z.string().min(1)).min(3).max(12),
    suggested_starting_bid: z.number().int().nonnegative(),
  })
  .refine((value) => value.estimate_high >= value.estimate_low, {
    message: 'estimate_high must be greater than or equal to estimate_low',
    path: ['estimate_high'],
  })

export type AiListingAssistantResponse = z.infer<
  typeof AiListingAssistantResponseSchema
>
