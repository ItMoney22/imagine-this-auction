import {
  AI_IMAGE_BUCKET,
  AI_IMAGE_DISCLOSURE,
  IMAGE_INTEGRITY_RULES,
  IMAGE_NEGATIVE_PROMPT,
  ORIGINAL_IMAGE_BUCKET,
  type ImageVariant,
} from '@/lib/ai/quick-listing'

/**
 * AI presentation-image generation.
 *
 * These images are marketing presentation only. Every prompt carries the
 * integrity rules from `quick-listing.ts` verbatim, the provider is always an
 * image-*editing* model (never text-to-image from scratch), and the output is
 * stored in a separate bucket and table from the verified originals.
 */

export class ImageProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(
      `Image generation provider "${provider}" is not configured. Set REPLICATE_API_TOKEN to enable presentation images.`
    )
    this.name = 'ImageProviderNotConfiguredError'
  }
}

export class ImageGenerationError extends Error {
  constructor(
    message: string,
    public readonly providerJobId: string | null = null
  ) {
    super(message)
    this.name = 'ImageGenerationError'
  }
}

// ============================================================
// Prompts
// ============================================================

const VARIANT_DIRECTION: Record<ImageVariant, string> = {
  cleanup:
    'Replace only the background with a clean, seamless, neutral light-grey studio backdrop. Remove background clutter, other objects and distracting surroundings. The item stays exactly as photographed.',
  studio:
    'Relight the scene as an even, soft-boxed product photograph on a neutral seamless backdrop with a natural contact shadow. Keep the item exactly as photographed — lighting and background only.',
  lifestyle:
    'Place the item in a tasteful, realistic in-use setting so a buyer can judge scale and context. Only the surrounding environment is added; the item itself is unchanged.',
}

export interface ItemContext {
  title?: string | null
  category?: string | null
  brand?: string | null
  conditionNotes?: string | null
}

export function buildImagePrompt(
  variant: ImageVariant,
  item: ItemContext,
  sceneHint?: string | null
): string {
  const descriptor = [item.brand, item.title].filter(Boolean).join(' ') || 'the item'

  const lines = [
    `Edit this photograph of ${descriptor}${item.category ? ` (category: ${item.category})` : ''} for an auction catalog.`,
    VARIANT_DIRECTION[variant],
  ]

  if (variant === 'lifestyle' && sceneHint?.trim()) {
    lines.push(`Preferred setting: ${sceneHint.trim().slice(0, 200)}.`)
  }

  lines.push('Strict rules that override every other instruction:')
  IMAGE_INTEGRITY_RULES.forEach((rule, index) => lines.push(`${index + 1}. ${rule}`))

  if (item.conditionNotes?.trim()) {
    lines.push(
      `The item has documented condition issues that MUST remain fully visible and unaltered: ${item.conditionNotes.trim().slice(0, 400)}`
    )
  }

  lines.push(
    'If any instruction would require changing the item itself, ignore that instruction and leave the item untouched.'
  )

  return lines.join('\n')
}

// ============================================================
// Provider: Replicate
// ============================================================

const DEFAULT_REPLICATE_MODEL = 'black-forest-labs/flux-kontext-dev'
const REPLICATE_POLL_INTERVAL_MS = 2_000
const REPLICATE_MAX_WAIT_MS = 90_000

export interface GenerateImageInput {
  variant: ImageVariant
  sourceImageUrl: string
  prompt: string
  model?: string | null
  /** Correlates the provider call with our own job row. */
  idempotencyKey: string
}

export interface GenerateImageResult {
  imageUrl: string
  providerJobId: string
  provider: string
  model: string
  raw: Record<string, unknown>
}

async function replicateRequest(
  path: string,
  init: RequestInit & { token: string }
): Promise<any> {
  const { token, ...rest } = init

  const response = await fetch(`https://api.replicate.com/v1${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(rest.headers ?? {}),
    },
    cache: 'no-store',
  })

  const text = await response.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text.slice(0, 1000) }
  }

  if (!response.ok) {
    throw new ImageGenerationError(
      `Replicate ${response.status}: ${body?.detail ?? body?.title ?? 'request failed'}`,
      body?.id ?? null
    )
  }

  return body
}

async function generateWithReplicate(input: GenerateImageInput): Promise<GenerateImageResult> {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) throw new ImageProviderNotConfiguredError('replicate')

  const model = input.model || DEFAULT_REPLICATE_MODEL

  let prediction = await replicateRequest(`/models/${model}/predictions`, {
    token,
    method: 'POST',
    headers: {
      // Ask Replicate to hold the connection open so fast models return inline.
      Prefer: 'wait=60',
      'Idempotency-Key': input.idempotencyKey.slice(0, 255),
    },
    body: JSON.stringify({
      input: {
        prompt: input.prompt,
        input_image: input.sourceImageUrl,
        image: input.sourceImageUrl,
        output_format: 'webp',
        // Editing models keep the subject when guidance stays moderate; pushing
        // it higher is what starts "improving" the item.
        guidance: 2.5,
        num_inference_steps: 28,
        disable_safety_checker: false,
      },
    }),
  })

  const startedAt = Date.now()

  while (
    prediction &&
    ['starting', 'processing'].includes(prediction.status) &&
    Date.now() - startedAt < REPLICATE_MAX_WAIT_MS
  ) {
    await new Promise((resolve) => setTimeout(resolve, REPLICATE_POLL_INTERVAL_MS))
    prediction = await replicateRequest(`/predictions/${prediction.id}`, { token, method: 'GET' })
  }

  if (!prediction) throw new ImageGenerationError('Replicate returned no prediction')

  if (prediction.status !== 'succeeded') {
    throw new ImageGenerationError(
      prediction.error
        ? String(prediction.error).slice(0, 400)
        : `Generation ${prediction.status ?? 'did not complete'}`,
      prediction.id ?? null
    )
  }

  const output = prediction.output
  const imageUrl = Array.isArray(output) ? output[0] : typeof output === 'string' ? output : null

  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new ImageGenerationError('Provider returned no image', prediction.id ?? null)
  }

  return {
    imageUrl,
    providerJobId: String(prediction.id),
    provider: 'replicate',
    model,
    raw: {
      status: prediction.status,
      metrics: prediction.metrics ?? {},
      model,
      created_at: prediction.created_at ?? null,
      completed_at: prediction.completed_at ?? null,
    },
  }
}

export async function generatePresentationImage(
  input: GenerateImageInput & { provider?: string | null }
): Promise<GenerateImageResult> {
  const provider = (input.provider || 'replicate').toLowerCase()

  switch (provider) {
    case 'replicate':
      return generateWithReplicate(input)
    default:
      throw new ImageProviderNotConfiguredError(provider)
  }
}

export function isImageGenerationConfigured(provider = 'replicate'): boolean {
  if (provider === 'replicate') return Boolean(process.env.REPLICATE_API_TOKEN)
  return false
}

// ============================================================
// Storage
// ============================================================

const MAX_GENERATED_BYTES = 15 * 1024 * 1024

export interface FetchedImage {
  bytes: Uint8Array
  contentType: string
  byteSize: number
}

/** Pull the provider's output into our own storage so links never rot. */
export async function fetchGeneratedImage(url: string): Promise<FetchedImage> {
  const response = await fetch(url, { cache: 'no-store' })

  if (!response.ok) {
    throw new ImageGenerationError(`Could not download generated image (${response.status})`)
  }

  const contentType = response.headers.get('content-type') ?? 'image/webp'

  if (!contentType.startsWith('image/')) {
    throw new ImageGenerationError(`Provider returned non-image content (${contentType})`)
  }

  const buffer = new Uint8Array(await response.arrayBuffer())

  if (buffer.byteLength === 0) {
    throw new ImageGenerationError('Provider returned an empty image')
  }

  if (buffer.byteLength > MAX_GENERATED_BYTES) {
    throw new ImageGenerationError('Generated image exceeded the 15MB storage limit')
  }

  return { bytes: buffer, contentType, byteSize: buffer.byteLength }
}

export function generatedImagePath(
  auctioneerId: string,
  targetId: string,
  variant: ImageVariant,
  contentType: string
): string {
  const extension = contentType.includes('png')
    ? 'png'
    : contentType.includes('jpeg') || contentType.includes('jpg')
      ? 'jpg'
      : 'webp'

  const unique = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}`

  return `${auctioneerId}/${targetId}/${variant}-${unique}.${extension}`
}

export { AI_IMAGE_BUCKET, AI_IMAGE_DISCLOSURE, IMAGE_NEGATIVE_PROMPT, ORIGINAL_IMAGE_BUCKET }
