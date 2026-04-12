const OLLAMA_URL = 'http://localhost:11434/api/generate'

export interface ExtractedProduct {
  product: string
  category: string
  origin_country: string | null
  manufacturing_cost_per_unit: number
  shipping_cost_per_unit: number
  quantity: number | null
  target_retailer: string | null
  additional_costs_per_unit: number | null
  error: string | null
}

export interface AIPricingAnalysis {
  // echoed from extraction
  product: string
  category: string
  origin_country: string | null
  quantity: number | null
  target_retailer: string | null
  // from analysis call
  landed_cost_breakdown: {
    manufacturing: number
    shipping: number
    tariff_rate_assumed: string
    tariff_cost: number
    additional: number
    total: number
  }
  pricing: {
    msrp: number
    wholesale_price: number
    supplier_margin: number
    retail_margin: number
  }
  confidence: {
    score: number
    label: 'Strong' | 'Good' | 'Risky' | 'Weak'
    explanation: string
  }
  buyer_perspective: {
    decision: string
    insights: string[]
    action: string
  }
  assumptions: string[]
}

// ─── Call 1: Extraction ───────────────────────────────────────────────────────

export function buildExtractionPrompt(message: string): string {
  return `You are a data extraction assistant. Extract structured product and cost information from the supplier's message.

Supplier message: "${message}"

Rules:
- shipping_cost_per_unit: if a total shipping cost and quantity are given, divide them (e.g. $300 / 1000 units = 0.30)
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
  "shipping_cost_per_unit": <number>,
  "quantity": <number or null>,
  "target_retailer": <string or null>,
  "additional_costs_per_unit": <number or null>,
  "error": <string or null>
}`
}

export function parseExtractionResponse(raw: string): ExtractedProduct {
  const outer = JSON.parse(raw) as { response: string }
  let inner: Record<string, unknown>
  try {
    inner = JSON.parse(outer.response) as Record<string, unknown>
  } catch {
    throw new Error('Invalid response: Ollama did not return valid JSON in the response field')
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
    shipping_cost_per_unit: (inner.shipping_cost_per_unit as number) ?? 0,
    quantity: (inner.quantity as number | null) ?? null,
    target_retailer: (inner.target_retailer as string | null) ?? null,
    additional_costs_per_unit: (inner.additional_costs_per_unit as number | null) ?? null,
    error: null,
  }
}

export async function extractProductData(message: string): Promise<ExtractedProduct> {
  let response: Response
  try {
    response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt: buildExtractionPrompt(message),
        stream: false,
        format: 'json',
      }),
    })
  } catch {
    throw new Error('Could not reach Ollama — make sure it is running at ' + OLLAMA_URL)
  }

  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}`)
  }

  return parseExtractionResponse(await response.text())
}

// ─── Call 2: Analysis ─────────────────────────────────────────────────────────

export function buildAnalysisPrompt(extracted: ExtractedProduct): string {
  return `You are a U.S. import pricing analyst with expertise in HTS tariff classification.

Extracted product data:
- Product: ${extracted.product}
- Category: ${extracted.category}
- Origin country: ${extracted.origin_country ?? 'unknown'}
- Manufacturing cost/unit: $${extracted.manufacturing_cost_per_unit}
- Shipping cost/unit: $${extracted.shipping_cost_per_unit}
- Additional costs/unit: $${extracted.additional_costs_per_unit ?? 0}
- Target retailer: ${extracted.target_retailer ?? 'generic U.S. retailer'}

Instructions:
1. Estimate the HTS tariff rate for this product category and origin country.
   - Account for Section 301 tariffs (China), Vietnam surcharges, and any other known country-specific duties.
   - State the assumed HTS code and rate explicitly in tariff_rate_assumed and in assumptions[].
2. Calculate landed cost = manufacturing + shipping + tariff + additional.
3. Generate MSRP and wholesale price for the U.S. market.
4. Calculate supplier_margin = (wholesale_price - landed_cost) / wholesale_price * 100 and retail_margin = (msrp - wholesale_price) / msrp * 100.
5. Score confidence 0-100. Penalise for unknown origin, high tariff uncertainty, or thin margins.
6. Tailor the buyer_perspective to ${extracted.target_retailer ?? 'generic U.S. retailer'}.
7. List every assumption made in the assumptions array (tariff rate, missing costs, inferred values).

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
}

type AnalysisPayload = Omit<AIPricingAnalysis, 'product' | 'category' | 'origin_country' | 'quantity' | 'target_retailer'>

const TOP_LEVEL_SECTIONS: (keyof AnalysisPayload)[] = [
  'landed_cost_breakdown',
  'pricing',
  'confidence',
  'buyer_perspective',
  'assumptions',
]

export function parseAnalysisResponse(raw: string): AnalysisPayload {
  const outer = JSON.parse(raw) as { response: string }
  let inner: Record<string, unknown>
  try {
    inner = JSON.parse(outer.response) as Record<string, unknown>
  } catch {
    throw new Error('Invalid response: Ollama did not return valid JSON in the response field')
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

export async function fetchAnalysis(extracted: ExtractedProduct): Promise<AnalysisPayload> {
  let response: Response
  try {
    response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt: buildAnalysisPrompt(extracted),
        stream: false,
        format: 'json',
      }),
    })
  } catch {
    throw new Error('Could not reach Ollama — make sure it is running at ' + OLLAMA_URL)
  }

  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}`)
  }

  return parseAnalysisResponse(await response.text())
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function fetchPricingAnalysis(message: string): Promise<AIPricingAnalysis> {
  const extracted = await extractProductData(message)
  const analysis = await fetchAnalysis(extracted)
  return {
    product: extracted.product,
    category: extracted.category,
    origin_country: extracted.origin_country,
    quantity: extracted.quantity,
    target_retailer: extracted.target_retailer,
    ...analysis,
  }
}
