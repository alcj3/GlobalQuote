import type { CostInputs } from '../types'

export interface AIPricingAnalysis {
  productName: string
  category: string
  landed_cost: number
  msrp: number
  wholesale_price: number
  supplier_margin: number
  retail_margin: number
  confidence_score: number
  confidence_label: 'Strong' | 'Good' | 'Risky' | 'Weak'
  confidence_explanation: string
  buyer_decision: 'Strong Buy' | 'Consider with Negotiation' | 'Unlikely to Accept' | 'Reject'
  buyer_insights: string[]
  buyer_action: string
}

const REQUIRED_FIELDS: (keyof Omit<AIPricingAnalysis, 'productName' | 'category'>)[] = [
  'landed_cost',
  'msrp',
  'wholesale_price',
  'supplier_margin',
  'retail_margin',
  'confidence_score',
  'confidence_label',
  'confidence_explanation',
  'buyer_decision',
  'buyer_insights',
  'buyer_action',
]

const OLLAMA_URL = 'http://localhost:11434/api/generate'

export function buildPrompt(inputs: CostInputs): string {
  return `You are a U.S. market pricing analyst. A supplier is asking for help pricing a product.

Inputs:
- Product Name: ${inputs.productName}
- Category: ${inputs.category}
- Manufacturing Cost: $${inputs.manufacturingCost}
- Shipping Cost: $${inputs.shippingCost}
- Additional Costs: $${inputs.additionalCosts} (0 means none provided — make a reasonable assumption)

Return ONLY a JSON object with these exact fields (no explanation, no markdown):
{
  "landed_cost": <number — sum of all costs>,
  "msrp": <number — suggested retail price for U.S. market>,
  "wholesale_price": <number — typically ~50% of msrp>,
  "supplier_margin": <number — percentage profit for the supplier>,
  "retail_margin": <number — percentage profit for the retailer>,
  "confidence_score": <integer 0-100>,
  "confidence_label": <"Strong" | "Good" | "Risky" | "Weak">,
  "confidence_explanation": <string — 1-2 sentences explaining the score>,
  "buyer_decision": <"Strong Buy" | "Consider with Negotiation" | "Unlikely to Accept" | "Reject">,
  "buyer_insights": <array of 2-4 strings — what a U.S. buyer would think>,
  "buyer_action": <string — one actionable sentence for the supplier>
}`
}

export function parseOllamaResponse(raw: string, inputs: CostInputs): AIPricingAnalysis {
  const outer = JSON.parse(raw) as { response: string }
  let inner: Record<string, unknown>
  try {
    inner = JSON.parse(outer.response) as Record<string, unknown>
  } catch {
    throw new Error('Invalid response: Ollama did not return valid JSON in the response field')
  }

  for (const field of REQUIRED_FIELDS) {
    if (inner[field] === undefined || inner[field] === null) {
      throw new Error(`Invalid response: missing required field "${field}"`)
    }
  }

  return {
    productName: inputs.productName,
    category: inputs.category,
    landed_cost: inner.landed_cost as number,
    msrp: inner.msrp as number,
    wholesale_price: inner.wholesale_price as number,
    supplier_margin: inner.supplier_margin as number,
    retail_margin: inner.retail_margin as number,
    confidence_score: inner.confidence_score as number,
    confidence_label: inner.confidence_label as AIPricingAnalysis['confidence_label'],
    confidence_explanation: inner.confidence_explanation as string,
    buyer_decision: inner.buyer_decision as AIPricingAnalysis['buyer_decision'],
    buyer_insights: inner.buyer_insights as string[],
    buyer_action: inner.buyer_action as string,
  }
}

export async function fetchPricingAnalysis(inputs: CostInputs): Promise<AIPricingAnalysis> {
  let response: Response
  try {
    response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt: buildPrompt(inputs),
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

  const raw = await response.text()
  return parseOllamaResponse(raw, inputs)
}
