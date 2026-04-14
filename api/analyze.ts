import type { VercelRequest, VercelResponse } from '@vercel/node'
import { lookupTariffRate } from '../src/services/hts-client'
import type { TariffResult } from '../src/services/hts-client'
import { getRetailerMargins } from '../src/services/retailer-config'
import type { ExtractedProduct, AIPricingAnalysis } from '../src/services/ollama-client'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

type AnalysisPayload = Omit<AIPricingAnalysis, 'product' | 'category' | 'origin_country' | 'quantity' | 'target_retailer'>

// ─── Extraction ───────────────────────────────────────────────────────────────

export function buildExtractionMessages(message: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You are a data extraction assistant. Extract structured product and cost information from the supplier's message.

Rules:
- shipping_cost_per_unit: extract the per-unit shipping cost using these patterns:
  - Per-unit phrasing: "$2 shipping per unit" → 2.00
  - Per-unit phrasing: "shipping is $2 each" → 2.00
  - Bulk total divided by quantity: "shipping costs $300 for 1000 units" → 0.30
  - Bulk total divided by quantity: "I pay $500 to ship 200 units" → 2.50
  - If shipping cost cannot be determined from the message, set shipping_cost_per_unit to null
- category: infer from context — must be one of: clothing, food, electronics, home_goods, other
- If you cannot identify a product name AND at least one cost, set error to:
  "Please describe your product and its costs, e.g. I sell hoodies, cost $6, shipping $2"
  and set all other fields to null or 0
- Otherwise set error to null

Return ONLY this JSON, no prose, no markdown:
{
  "product": <string>,
  "category": <string>,
  "origin_country": <string or null>,
  "manufacturing_cost_per_unit": <number>,
  "shipping_cost_per_unit": <number or null — null if shipping cost cannot be determined>,
  "quantity": <number or null>,
  "target_retailer": <string or null>,
  "additional_costs_per_unit": <number or null>,
  "error": <string or null>
}`,
    },
    {
      role: 'user',
      content: `Supplier message: "${message}"`,
    },
  ]
}

export function parseGroqExtraction(content: string): ExtractedProduct {
  let inner: Record<string, unknown>
  try {
    inner = JSON.parse(content) as Record<string, unknown>
  } catch {
    throw new Error('Invalid response: Groq did not return valid JSON')
  }

  if (typeof inner.error === 'string') {
    throw new Error(inner.error)
  }

  if (!inner.product) {
    throw new Error('Invalid response: missing required field "product"')
  }
  if (inner.manufacturing_cost_per_unit === undefined || inner.manufacturing_cost_per_unit === null) {
    throw new Error('Invalid response: missing required field "manufacturing_cost_per_unit"')
  }

  return {
    product: inner.product as string,
    category: inner.category as string,
    origin_country: (inner.origin_country as string | null) ?? null,
    manufacturing_cost_per_unit: inner.manufacturing_cost_per_unit as number,
    shipping_cost_per_unit: (inner.shipping_cost_per_unit as number | null) ?? null,
    quantity: (inner.quantity as number | null) ?? null,
    target_retailer: (inner.target_retailer as string | null) ?? null,
    additional_costs_per_unit: (inner.additional_costs_per_unit as number | null) ?? null,
    error: null,
  }
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

export function buildAnalysisMessages(extracted: ExtractedProduct, tariff?: TariffResult): ChatMessage[] {
  const margins = getRetailerMargins(extracted.target_retailer)

  const retailerInstruction = `Retailer margin context:
- ${margins.name} expects a retail margin of ${margins.min_margin}–${margins.max_margin}%.
- In buyer_perspective.insights, include one insight about retail_margin direction for ${margins.name}: if retail_margin is below ${margins.min_margin}%, state it is too thin; if above ${margins.max_margin}%, state it is too wide; if between ${margins.min_margin}% and ${margins.max_margin}%, state it is on-target.
- In buyer_perspective.insights, include one insight about supplier_margin direction: if supplier_margin is below 25%, state it is too thin; if above 45%, state it is too wide; if between 25% and 45%, state it is on-target.
- If retail_margin is more than 5 percentage points outside this range, penalise the confidence score.`

  const tariffInstruction = tariff
    ? `1. The duty rate for this product has been looked up from the HTS schedule:
   HTS ${tariff.hts_code} — total rate ${tariff.total_rate}% (${tariff.base_rate}% MFN + ${tariff.surcharge}% surcharge).
   Use this exact rate. Set tariff_rate_assumed to "${tariff.total_rate}% — HTS ${tariff.hts_code} (${extracted.origin_country ?? 'origin'}: ${tariff.base_rate}% MFN + ${tariff.surcharge}% surcharge, HTS schedule)".
   Do NOT estimate or override this value.
   Add to assumptions[]: "Tariff rate sourced from HTS category map: ${tariff.hts_code} at ${tariff.total_rate}%"`
    : `1. Estimate the HTS tariff rate for this product category and origin country.
   - Account for Section 301 tariffs (China), Vietnam surcharges, and any other known country-specific duties.
   - State the assumed HTS code and rate explicitly in tariff_rate_assumed and in assumptions[].`

  const shippingDisplay = extracted.shipping_cost_per_unit !== null
    ? `$${extracted.shipping_cost_per_unit}`
    : 'unknown'
  const shippingAssumptionInstruction = extracted.shipping_cost_per_unit === null
    ? '\n   - Shipping cost was not provided. Estimate a reasonable shipping cost per unit and add a shipping assumption to assumptions[].'
    : ''

  const msrpFloorInstruction =
    (extracted.category === 'home_goods' || extracted.category === 'home_ceramics')
      ? `\n   Price floor for home_goods / home_ceramics: U.S. retail reality for ceramic mugs and bowls is $8–15.
   If the formula produces an msrp below $7, scale up wholesale_price so that msrp is at least $8.
   Use msrp = 8, then back-calculate: wholesale_price = msrp * (1 - retail_margin / 100).`
      : extracted.category === 'clothing'
        ? `\n   Price floor for clothing: U.S. retail reality for imported apparel is $20–60.
   If the formula produces an msrp below $19, scale up wholesale_price so that msrp is at least $20.
   Use msrp = 20, then back-calculate: wholesale_price = msrp * (1 - retail_margin / 100).`
        : ''

  const systemContent = `You are a U.S. import pricing analyst with expertise in HTS tariff classification.

Instructions:
${tariffInstruction}
2. Calculate landed cost = manufacturing + shipping + tariff + additional.
   tariff_cost = manufacturing_cost_per_unit * (total_rate / 100). Shipping is not included in the duty base.${shippingAssumptionInstruction}
3. Derive wholesale_price and msrp from target margins — NEVER set wholesale_price equal to or less than landed_cost:
   - Choose supplier_margin between 25% and 45%
   - wholesale_price = landed_cost / (1 - supplier_margin / 100)
   - Choose retail_margin to meet the retailer's expected range (see step 6)
   - msrp = wholesale_price / (1 - retail_margin / 100)${msrpFloorInstruction}
4. Verify using these formulas and confirm both margins are positive before returning JSON:
   - Supplier Margin = (wholesale_price - landed_cost) / wholesale_price * 100
   - Retail Margin = (msrp - wholesale_price) / msrp * 100
   Verify margin consistency: wholesale_price must be strictly between landed_cost and msrp before returning JSON.
5. Score confidence 0-100. Penalise for unknown origin, high tariff uncertainty, or thin margins.
6. ${retailerInstruction}
7. Tailor the buyer_perspective to ${extracted.target_retailer ?? 'generic U.S. retailer'}. In buyer_perspective.insights, reference the exact supplier_margin and retail_margin values you calculated in step 4 so insights are grounded in the real numbers. buyer_perspective.decision must be a non-empty string, e.g. 'Proceed with negotiation' or 'Strong buy at current terms'.
8. List every assumption made in the assumptions array (tariff rate, missing costs, inferred values).

Return ONLY this JSON, no prose, no markdown:
{
  "landed_cost_breakdown": {
    "manufacturing": <number>,
    "shipping": <number>,
    "tariff_rate_assumed": <string — e.g. "25% — Vietnam clothing HTS 6101.20">,
    "tariff_cost": <number>,
    "additional": <number>,
    "total": <number>
  },
  "pricing": {
    "msrp": <number>,
    "wholesale_price": <number>,
    "supplier_margin": <number — percentage>,
    "retail_margin": <number — percentage>
  },
  "confidence": {
    "score": <integer 0-100>,
    "label": <"Strong" | "Good" | "Risky" | "Weak">,
    "explanation": <string>
  },
  "buyer_perspective": {
    "decision": <string>,
    "insights": <array of strings>,
    "action": <string>
  },
  "assumptions": <array of strings>
}`

  const userContent = `Extracted product data:
- Product: ${extracted.product}
- Category: ${extracted.category}
- Origin country: ${extracted.origin_country ?? 'unknown'}
- Manufacturing cost/unit: $${extracted.manufacturing_cost_per_unit}
- Shipping cost/unit: ${shippingDisplay}
- Additional costs/unit: $${extracted.additional_costs_per_unit ?? 0}
- Target retailer: ${extracted.target_retailer ?? 'generic U.S. retailer'}`

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ]
}

const TOP_LEVEL_SECTIONS = [
  'landed_cost_breakdown', 'pricing', 'confidence', 'buyer_perspective', 'assumptions',
] as const

export function parseGroqAnalysis(content: string): AnalysisPayload {
  let inner: Record<string, unknown>
  try {
    inner = JSON.parse(content) as Record<string, unknown>
  } catch {
    throw new Error('Invalid response: Groq did not return valid JSON')
  }

  for (const section of TOP_LEVEL_SECTIONS) {
    if (inner[section] === undefined || inner[section] === null) {
      throw new Error(`Invalid response: missing required section "${section}"`)
    }
  }

  const breakdown = inner.landed_cost_breakdown as Record<string, unknown>
  if (breakdown.total === undefined || breakdown.total === null) {
    throw new Error('Invalid response: missing required field "landed_cost_breakdown.total"')
  }

  const pricing = inner.pricing as Record<string, unknown>
  if (pricing.msrp === undefined || pricing.msrp === null) {
    throw new Error('Invalid response: missing required field "pricing.msrp"')
  }

  const confidence = inner.confidence as Record<string, unknown>
  if (confidence.score === undefined || confidence.score === null) {
    throw new Error('Invalid response: missing required field "confidence.score"')
  }

  return {
    landed_cost_breakdown: inner.landed_cost_breakdown as AIPricingAnalysis['landed_cost_breakdown'],
    pricing: inner.pricing as AIPricingAnalysis['pricing'],
    confidence: inner.confidence as AIPricingAnalysis['confidence'],
    buyer_perspective: inner.buyer_perspective as AIPricingAnalysis['buyer_perspective'],
    assumptions: inner.assumptions as string[],
  }
}

// ─── Groq fetch helper ────────────────────────────────────────────────────────

async function callGroq(messages: ChatMessage[], apiKey: string): Promise<string> {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status}`)
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>
  }
  return data.choices[0].message.content
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = req.body as { message?: string }
  if (!body?.message) {
    return res.status(400).json({ error: 'message is required' })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Pricing service unavailable. Please try again.' })
  }

  try {
    // Step 1 — extract product data
    const extractionContent = await callGroq(buildExtractionMessages(body.message), apiKey)
    const extracted = parseGroqExtraction(extractionContent)

    // Step 2 — tariff lookup (synchronous)
    const tariff = lookupTariffRate(extracted.category, extracted.origin_country) ?? undefined

    // Step 3 — pricing analysis
    const analysisContent = await callGroq(buildAnalysisMessages(extracted, tariff), apiKey)
    const analysisPayload = parseGroqAnalysis(analysisContent)

    // Step 4 — assemble and return
    const result: AIPricingAnalysis = {
      product: extracted.product,
      category: extracted.category,
      origin_country: extracted.origin_country,
      quantity: extracted.quantity,
      target_retailer: extracted.target_retailer,
      ...analysisPayload,
    }

    return res.status(200).json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Pricing service unavailable. Please try again.'
    const isUserError = message.startsWith('Please describe')
    return res.status(isUserError ? 400 : 500).json({ error: message })
  }
}
