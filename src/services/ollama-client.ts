// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedProduct {
  product: string
  category: string
  origin_country: string | null
  manufacturing_cost_per_unit: number
  shipping_cost_per_unit: number | null
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

// ─── Client ───────────────────────────────────────────────────────────────────

export async function fetchPricingAnalysis(message: string): Promise<AIPricingAnalysis> {
  let response: Response
  try {
    response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
  } catch {
    throw new Error('Pricing service unavailable. Please try again.')
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error('Pricing service unavailable. Please try again.')
  }

  if (!response.ok) {
    const err = data as { error?: string }
    if (response.status === 400 && err?.error) throw new Error(err.error)
    throw new Error('Pricing service unavailable. Please try again.')
  }

  return data as AIPricingAnalysis
}
