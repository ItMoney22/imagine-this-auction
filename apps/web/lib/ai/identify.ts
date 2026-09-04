import OpenAI from 'openai'

import {
  CandidateSchema,
  classifyScan,
  type ClassifiedScan,
  type ListingCandidate,
} from '@/lib/ai/quick-listing'

/**
 * Item identification: barcode/ISBN catalog lookups + photo understanding.
 *
 * Every provider call is wrapped so a single flaky data source degrades into a
 * lower-confidence result rather than failing the whole scan. Raw payloads are
 * returned alongside the candidates so the route can persist them to
 * `ai_listing_sources` for auditability.
 */

export interface SourceRecord {
  source_type: 'barcode' | 'isbn' | 'vision' | 'ocr' | 'catalog' | 'manual'
  provider: string
  query: string | null
  matched: boolean
  confidence: number | null
  payload: unknown
  latency_ms: number
  error: string | null
}

export interface IdentifyResult {
  candidates: ListingCandidate[]
  sources: SourceRecord[]
  scan: ClassifiedScan | null
  visionSummary: string | null
  ocrText: string | null
}

const LOOKUP_TIMEOUT_MS = 8_000

async function fetchJson(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ImagineThisAuction/1.0 (+https://imaginethisauction.com)',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    })

    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = { raw: text.slice(0, 2000) }
    }

    return { ok: response.ok, status: response.status, body }
  } finally {
    clearTimeout(timer)
  }
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

// ============================================================
// Books — Open Library (free, keyless)
// ============================================================

async function lookupOpenLibrary(isbn: string): Promise<{
  candidates: ListingCandidate[]
  source: SourceRecord
}> {
  const started = Date.now()
  const query = `ISBN:${isbn}`

  try {
    const { ok, body } = await fetchJson(
      `https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(query)}&format=json&jscmd=data`
    )

    const record = ok && body && typeof body === 'object' ? (body as Record<string, any>)[query] : null

    if (!record) {
      return {
        candidates: [],
        source: {
          source_type: 'isbn',
          provider: 'openlibrary',
          query: isbn,
          matched: false,
          confidence: null,
          payload: body ?? {},
          latency_ms: Date.now() - started,
          error: null,
        },
      }
    }

    const authors = Array.isArray(record.authors)
      ? record.authors.map((a: any) => a?.name).filter(Boolean).join(', ')
      : ''
    const publisher = Array.isArray(record.publishers)
      ? record.publishers.map((p: any) => p?.name).filter(Boolean).join(', ')
      : ''

    const attributes: Record<string, string> = {}
    if (authors) attributes.Author = truncate(authors, 120)
    if (publisher) attributes.Publisher = truncate(publisher, 120)
    if (record.publish_date) attributes['Publish date'] = String(record.publish_date).slice(0, 40)
    if (record.number_of_pages) attributes.Pages = String(record.number_of_pages)
    if (Array.isArray(record.subjects) && record.subjects.length) {
      attributes.Subjects = truncate(
        record.subjects.slice(0, 4).map((s: any) => s?.name).filter(Boolean).join(', '),
        120
      )
    }

    const candidate = CandidateSchema.parse({
      title: truncate(String(record.title ?? 'Untitled book'), 140),
      brand: publisher ? truncate(publisher, 80) : null,
      model: null,
      category: 'Books & Manuscripts',
      identifier: isbn,
      summary: truncate(
        [authors && `By ${authors}`, publisher, record.publish_date].filter(Boolean).join(' · '),
        600
      ),
      // A valid ISBN resolving in a book catalog is about as certain as
      // identification gets — the code maps to exactly one edition.
      confidence: 0.95,
      source: 'openlibrary',
      source_url: record.url ?? null,
      image_url: record.cover?.medium ?? record.cover?.large ?? null,
      attributes,
    })

    return {
      candidates: [candidate],
      source: {
        source_type: 'isbn',
        provider: 'openlibrary',
        query: isbn,
        matched: true,
        confidence: 0.95,
        payload: record,
        latency_ms: Date.now() - started,
        error: null,
      },
    }
  } catch (error) {
    return {
      candidates: [],
      source: {
        source_type: 'isbn',
        provider: 'openlibrary',
        query: isbn,
        matched: false,
        confidence: null,
        payload: {},
        latency_ms: Date.now() - started,
        error: error instanceof Error ? error.message : 'lookup failed',
      },
    }
  }
}

// ============================================================
// General merchandise — UPCitemdb (keyless trial tier)
// ============================================================

async function lookupUpcItemDb(code: string): Promise<{
  candidates: ListingCandidate[]
  source: SourceRecord
}> {
  const started = Date.now()

  try {
    const { ok, body } = await fetchJson(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`
    )

    const items = ok && body && typeof body === 'object' ? (body as any).items : null

    if (!Array.isArray(items) || items.length === 0) {
      return {
        candidates: [],
        source: {
          source_type: 'barcode',
          provider: 'upcitemdb',
          query: code,
          matched: false,
          confidence: null,
          payload: body ?? {},
          latency_ms: Date.now() - started,
          error: null,
        },
      }
    }

    const candidates = items.slice(0, 5).map((item: any, index: number) => {
      const attributes: Record<string, string> = {}
      if (item.brand) attributes.Brand = truncate(String(item.brand), 80)
      if (item.model) attributes.Model = truncate(String(item.model), 80)
      if (item.color) attributes.Color = truncate(String(item.color), 60)
      if (item.size) attributes.Size = truncate(String(item.size), 60)
      if (item.weight) attributes.Weight = truncate(String(item.weight), 60)
      if (item.dimension) attributes.Dimensions = truncate(String(item.dimension), 80)

      return CandidateSchema.parse({
        title: truncate(String(item.title ?? 'Unidentified product'), 140),
        brand: item.brand ? truncate(String(item.brand), 80) : null,
        model: item.model ? truncate(String(item.model), 120) : null,
        category: item.category ? truncate(String(item.category).split('>').pop()?.trim() ?? '', 80) : null,
        identifier: code,
        summary: truncate(String(item.description ?? ''), 600),
        // First result from an exact barcode match is strong; later results in
        // the same response are alternate listings for the same code.
        confidence: index === 0 ? 0.9 : Math.max(0.5, 0.9 - index * 0.12),
        source: 'upcitemdb',
        source_url: Array.isArray(item.offers) && item.offers[0]?.link ? item.offers[0].link : null,
        image_url: Array.isArray(item.images) && item.images[0] ? item.images[0] : null,
        attributes,
      })
    })

    return {
      candidates,
      source: {
        source_type: 'barcode',
        provider: 'upcitemdb',
        query: code,
        matched: true,
        confidence: candidates[0]?.confidence ?? null,
        payload: { items: items.slice(0, 5) },
        latency_ms: Date.now() - started,
        error: null,
      },
    }
  } catch (error) {
    return {
      candidates: [],
      source: {
        source_type: 'barcode',
        provider: 'upcitemdb',
        query: code,
        matched: false,
        confidence: null,
        payload: {},
        latency_ms: Date.now() - started,
        error: error instanceof Error ? error.message : 'lookup failed',
      },
    }
  }
}

// ============================================================
// Optional keyed provider — Barcode Lookup
// ============================================================

async function lookupBarcodeLookupApi(code: string): Promise<{
  candidates: ListingCandidate[]
  source: SourceRecord
} | null> {
  const key = process.env.BARCODE_LOOKUP_API_KEY
  if (!key) return null

  const started = Date.now()

  try {
    const { ok, body } = await fetchJson(
      `https://api.barcodelookup.com/v3/products?barcode=${encodeURIComponent(code)}&formatted=y&key=${encodeURIComponent(key)}`
    )

    const products = ok && body && typeof body === 'object' ? (body as any).products : null

    if (!Array.isArray(products) || products.length === 0) {
      return {
        candidates: [],
        source: {
          source_type: 'barcode',
          provider: 'barcodelookup',
          query: code,
          matched: false,
          confidence: null,
          payload: body ?? {},
          latency_ms: Date.now() - started,
          error: null,
        },
      }
    }

    const candidates = products.slice(0, 3).map((product: any, index: number) => {
      const attributes: Record<string, string> = {}
      if (product.brand) attributes.Brand = truncate(String(product.brand), 80)
      if (product.model) attributes.Model = truncate(String(product.model), 80)
      if (product.manufacturer) attributes.Manufacturer = truncate(String(product.manufacturer), 80)
      if (product.color) attributes.Color = truncate(String(product.color), 60)

      return CandidateSchema.parse({
        title: truncate(String(product.title ?? product.product_name ?? 'Unidentified product'), 140),
        brand: product.brand ? truncate(String(product.brand), 80) : null,
        model: product.model ? truncate(String(product.model), 120) : null,
        category: product.category
          ? truncate(String(product.category).split('>').pop()?.trim() ?? '', 80)
          : null,
        identifier: code,
        summary: truncate(String(product.description ?? ''), 600),
        confidence: index === 0 ? 0.92 : 0.7,
        source: 'barcodelookup',
        source_url: null,
        image_url: Array.isArray(product.images) && product.images[0] ? product.images[0] : null,
        attributes,
      })
    })

    return {
      candidates,
      source: {
        source_type: 'barcode',
        provider: 'barcodelookup',
        query: code,
        matched: true,
        confidence: candidates[0]?.confidence ?? null,
        payload: { products: products.slice(0, 3) },
        latency_ms: Date.now() - started,
        error: null,
      },
    }
  } catch (error) {
    return {
      candidates: [],
      source: {
        source_type: 'barcode',
        provider: 'barcodelookup',
        query: code,
        matched: false,
        confidence: null,
        payload: {},
        latency_ms: Date.now() - started,
        error: error instanceof Error ? error.message : 'lookup failed',
      },
    }
  }
}

// ============================================================
// Photo understanding + OCR
// ============================================================

const VISION_SYSTEM_PROMPT = `You identify second-hand items from photographs for an online auction house.

Return JSON only, shaped exactly:
{
  "ocr_text": "every legible word, code, label or marking visible in the photos, joined with ' | '. Empty string if none.",
  "visual_summary": "2-3 sentences describing only what is actually visible: form, materials, colour, markings, visible wear.",
  "candidates": [
    {
      "title": "specific item name a buyer would search for",
      "brand": "brand or null",
      "model": "model/pattern/edition or null",
      "category": "one plain-English category",
      "summary": "why this identification fits, and what would confirm it",
      "confidence": 0.0,
      "attributes": { "Attribute name": "value" }
    }
  ]
}

Rules:
- Return 1-4 candidates. If the photos genuinely support more than one identification, return them all rather than guessing one.
- confidence is your honest probability that the candidate is correct. Use below 0.7 whenever a visible marking, model number or hallmark would be needed to be sure.
- Never invent a brand, model, serial number, edition or provenance that is not legible in the photo.
- Attributes must be observable facts (material, colour, approximate size, markings), not sales claims.`

export interface VisionIdentification {
  candidates: ListingCandidate[]
  ocrText: string
  visualSummary: string
  source: SourceRecord
  model: string
}

export async function identifyFromImages(
  imageUrls: string[],
  options: { manualContext?: string; scanValue?: string; model?: string; apiKey: string }
): Promise<VisionIdentification> {
  const started = Date.now()
  const model = options.model || 'gpt-4o-mini'
  const client = new OpenAI({ apiKey: options.apiKey })

  const contextLines = [
    options.scanValue
      ? `A code was scanned from the item or its packaging: ${options.scanValue}. Use it only if it is legible in a photo; do not invent catalog data for it.`
      : 'No barcode was scanned.',
    options.manualContext
      ? `Auctioneer notes: ${options.manualContext}`
      : 'The auctioneer provided no additional notes.',
    'Identify the item shown.',
  ]

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 1400,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: VISION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: contextLines.join('\n') },
          ...imageUrls.slice(0, 6).map((url) => ({
            type: 'image_url' as const,
            image_url: { url, detail: 'high' as const },
          })),
        ],
      },
    ],
  })

  const raw = completion.choices[0]?.message?.content
  if (!raw) throw new Error('Vision model returned an empty response')

  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Vision model returned invalid JSON')
  }

  const candidates: ListingCandidate[] = Array.isArray(parsed.candidates)
    ? parsed.candidates
        .slice(0, 4)
        .map((candidate: any) => {
          const result = CandidateSchema.safeParse({
            title: truncate(String(candidate?.title ?? 'Unidentified item'), 140),
            brand: candidate?.brand ? truncate(String(candidate.brand), 80) : null,
            model: candidate?.model ? truncate(String(candidate.model), 120) : null,
            category: candidate?.category ? truncate(String(candidate.category), 80) : null,
            identifier: options.scanValue ?? null,
            summary: truncate(String(candidate?.summary ?? ''), 600),
            confidence: Math.max(0, Math.min(1, Number(candidate?.confidence ?? 0.4))),
            source: 'vision',
            source_url: null,
            image_url: null,
            attributes: normalizeAttributes(candidate?.attributes),
          })

          return result.success ? result.data : null
        })
        .filter((c: ListingCandidate | null): c is ListingCandidate => c !== null)
    : []

  return {
    candidates,
    ocrText: typeof parsed.ocr_text === 'string' ? parsed.ocr_text.slice(0, 4000) : '',
    visualSummary:
      typeof parsed.visual_summary === 'string' ? parsed.visual_summary.slice(0, 2000) : '',
    model,
    source: {
      source_type: 'vision',
      provider: 'openai',
      query: options.scanValue ?? null,
      matched: candidates.length > 0,
      confidence: candidates[0]?.confidence ?? null,
      payload: {
        model,
        image_count: imageUrls.length,
        ocr_text: typeof parsed.ocr_text === 'string' ? parsed.ocr_text.slice(0, 2000) : '',
        visual_summary:
          typeof parsed.visual_summary === 'string' ? parsed.visual_summary.slice(0, 1000) : '',
        candidates: parsed.candidates ?? [],
      },
      latency_ms: Date.now() - started,
      error: null,
    },
  }
}

function normalizeAttributes(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([k, v]) => k && v != null && typeof v !== 'object')
    .slice(0, 12)
    .map(([k, v]) => [truncate(k, 40), truncate(String(v), 120)] as const)

  return Object.fromEntries(entries)
}

// ============================================================
// Merge + score
// ============================================================

function candidateKey(candidate: ListingCandidate) {
  return [candidate.brand ?? '', candidate.model ?? '', candidate.title]
    .join('|')
    .toLowerCase()
    .replace(/[^a-z0-9|]/g, '')
}

/**
 * Merge catalog and vision candidates.
 *
 * When a barcode match and the photos agree, that is genuine corroboration and
 * the score goes up. When they disagree, both stay on the list at their own
 * score so the auctioneer can choose — the platform does not pick a winner.
 */
export function mergeCandidates(
  catalogCandidates: ListingCandidate[],
  visionCandidates: ListingCandidate[]
): ListingCandidate[] {
  const merged: ListingCandidate[] = []
  const seen = new Map<string, number>()

  const push = (candidate: ListingCandidate) => {
    const key = candidateKey(candidate)
    const existingIndex = seen.get(key)

    if (existingIndex === undefined) {
      seen.set(key, merged.length)
      merged.push({ ...candidate })
      return
    }

    const existing = merged[existingIndex]
    merged[existingIndex] = {
      ...existing,
      // Corroborated across two independent sources.
      confidence: Math.min(0.98, Math.max(existing.confidence, candidate.confidence) + 0.05),
      summary: existing.summary || candidate.summary,
      image_url: existing.image_url ?? candidate.image_url,
      source_url: existing.source_url ?? candidate.source_url,
      attributes: { ...candidate.attributes, ...existing.attributes },
      source: existing.source === candidate.source ? existing.source : `${existing.source}+${candidate.source}`,
    }
  }

  catalogCandidates.forEach(push)
  visionCandidates.forEach(push)

  const catalogTitles = catalogCandidates.map((c) => candidateKey(c))
  const visionTitles = visionCandidates.map((c) => candidateKey(c))
  const disagrees =
    catalogTitles.length > 0 &&
    visionTitles.length > 0 &&
    !catalogTitles.some((t) => visionTitles.includes(t))

  const scored = disagrees
    ? merged.map((candidate) => ({
        ...candidate,
        // Barcode and photos point at different things — one of them is wrong.
        confidence: Math.max(0.3, candidate.confidence - 0.2),
      }))
    : merged

  return scored.sort((a, b) => b.confidence - a.confidence).slice(0, 6)
}

export interface IdentifyInput {
  scanValue?: string
  imageUrls: string[]
  manualContext?: string
  openAiApiKey?: string
  visionModel?: string | null
}

export async function identifyItem(input: IdentifyInput): Promise<IdentifyResult> {
  const sources: SourceRecord[] = []
  const scan = input.scanValue ? classifyScan(input.scanValue) : null

  let catalogCandidates: ListingCandidate[] = []

  if (scan && scan.format !== 'sku' && scan.format !== 'other') {
    const lookups: Array<Promise<{ candidates: ListingCandidate[]; source: SourceRecord } | null>> = []

    if (scan.format === 'isbn_10' || scan.format === 'isbn_13') {
      lookups.push(lookupOpenLibrary(scan.value))
    }

    lookups.push(lookupUpcItemDb(scan.lookupValue))
    lookups.push(lookupBarcodeLookupApi(scan.lookupValue))

    const settled = await Promise.all(lookups)

    for (const entry of settled) {
      if (!entry) continue
      sources.push(entry.source)
      catalogCandidates = catalogCandidates.concat(entry.candidates)
    }

    // A bad checksum means the scan itself is suspect, whatever it matched.
    if (!scan.checksumValid) {
      catalogCandidates = catalogCandidates.map((candidate) => ({
        ...candidate,
        confidence: Math.max(0.25, candidate.confidence - 0.25),
      }))
    }
  } else if (scan) {
    sources.push({
      source_type: 'manual',
      provider: 'internal',
      query: scan.value,
      matched: false,
      confidence: null,
      payload: { note: 'SKU / free-form code — no public catalog lookup available', format: scan.format },
      latency_ms: 0,
      error: null,
    })
  }

  let visionCandidates: ListingCandidate[] = []
  let ocrText: string | null = null
  let visionSummary: string | null = null

  if (input.imageUrls.length > 0 && input.openAiApiKey) {
    try {
      const vision = await identifyFromImages(input.imageUrls, {
        manualContext: input.manualContext,
        scanValue: scan?.value,
        model: input.visionModel ?? undefined,
        apiKey: input.openAiApiKey,
      })

      visionCandidates = vision.candidates
      ocrText = vision.ocrText || null
      visionSummary = vision.visualSummary || null
      sources.push(vision.source)
    } catch (error) {
      sources.push({
        source_type: 'vision',
        provider: 'openai',
        query: null,
        matched: false,
        confidence: null,
        payload: {},
        latency_ms: 0,
        error: error instanceof Error ? error.message : 'vision failed',
      })
    }
  }

  return {
    candidates: mergeCandidates(catalogCandidates, visionCandidates),
    sources,
    scan,
    visionSummary,
    ocrText,
  }
}
