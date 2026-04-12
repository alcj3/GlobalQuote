import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildExtractionPrompt,
  parseExtractionResponse,
  extractProductData,
  buildAnalysisPrompt,
  parseAnalysisResponse,
  fetchPricingAnalysis,
  fetchAnalysis,
} from './ollama-client'
import type { ExtractedProduct } from './ollama-client'
import type { TariffResult } from './hts-client'

const baseMessage = 'I sell ceramic mugs made in Vietnam, manufacturing cost $3, shipping $0.50 per unit, selling to Walmart'

const validExtraction: ExtractedProduct = {
  product: 'Ceramic Mug',
  category: 'home_goods',
  origin_country: 'Vietnam',
  manufacturing_cost_per_unit: 3,
  shipping_cost_per_unit: 0.5,
  quantity: null,
  target_retailer: 'Walmart',
  additional_costs_per_unit: null,
  error: null,
}

const validAnalysisPayload = {
  landed_cost_breakdown: {
    manufacturing: 3,
    shipping: 0.5,
    tariff_rate_assumed: '25% — Vietnam home goods HTS 6912.00',
    tariff_cost: 0.88,
    additional: 0,
    total: 4.38,
  },
  pricing: {
    msrp: 12,
    wholesale_price: 6,
    supplier_margin: 27.0,
    retail_margin: 50.0,
  },
  confidence: {
    score: 72,
    label: 'Good',
    explanation: 'Solid margins despite tariff exposure.',
  },
  buyer_perspective: {
    decision: 'Consider with Negotiation',
    insights: ['Tariff exposure is a concern', 'Price point competitive for Walmart'],
    action: 'Negotiate manufacturing cost below $2.50 to absorb tariff.',
  },
  assumptions: [
    'Assumed 25% tariff rate for Vietnam ceramics under HTS 6912.00',
    'Additional costs assumed $0',
  ],
}

// ─── buildExtractionPrompt ────────────────────────────────────────────────────

describe('buildExtractionPrompt', () => {
  it('includes the user message', () => {
    expect(buildExtractionPrompt(baseMessage)).toContain(baseMessage)
  })

  it('includes all 9 required field names in the schema', () => {
    const prompt = buildExtractionPrompt(baseMessage)
    const fields = [
      'product', 'category', 'origin_country',
      'manufacturing_cost_per_unit', 'shipping_cost_per_unit',
      'quantity', 'target_retailer', 'additional_costs_per_unit', 'error',
    ]
    for (const field of fields) {
      expect(prompt).toContain(field)
    }
  })

  // Bug 1 — shipping few-shot examples
  it('includes few-shot example for "$2 shipping per unit"', () => {
    expect(buildExtractionPrompt(baseMessage)).toContain('$2 shipping per unit')
  })

  it('includes few-shot example for bulk shipping divided by quantity showing 0.30', () => {
    const prompt = buildExtractionPrompt(baseMessage)
    expect(prompt).toContain('$300')
    expect(prompt).toContain('1000')
    expect(prompt).toContain('0.30')
  })

  it('includes few-shot example for "shipping is $2 each"', () => {
    expect(buildExtractionPrompt(baseMessage)).toContain('shipping is $2 each')
  })

  it('includes few-shot example for "$500 to ship 200 units" showing 2.50', () => {
    const prompt = buildExtractionPrompt(baseMessage)
    expect(prompt).toContain('$500')
    expect(prompt).toContain('200 units')
    expect(prompt).toContain('2.50')
  })

  it('instructs setting shipping_cost_per_unit to null when shipping cannot be determined', () => {
    const prompt = buildExtractionPrompt(baseMessage)
    expect(prompt).toMatch(/shipping.*null|null.*shipping/i)
  })
})

// ─── parseExtractionResponse ──────────────────────────────────────────────────

describe('parseExtractionResponse', () => {
  it('returns a complete ExtractedProduct from a valid response', () => {
    const raw = JSON.stringify({ response: JSON.stringify(validExtraction), done: true })
    const result = parseExtractionResponse(raw)
    expect(result.product).toBe('Ceramic Mug')
    expect(result.category).toBe('home_goods')
    expect(result.origin_country).toBe('Vietnam')
    expect(result.manufacturing_cost_per_unit).toBe(3)
    expect(result.shipping_cost_per_unit).toBe(0.5)
    expect(result.target_retailer).toBe('Walmart')
    expect(result.error).toBeNull()
  })

  it('throws the error string when error field is non-null', () => {
    const payload = { ...validExtraction, error: 'Please describe your product and its costs, e.g. I sell hoodies, cost $6, shipping $2' }
    const raw = JSON.stringify({ response: JSON.stringify(payload), done: true })
    expect(() => parseExtractionResponse(raw)).toThrow('Please describe your product and its costs')
  })

  it('throws "Invalid response" when inner response is not valid JSON', () => {
    const raw = JSON.stringify({ response: 'not json', done: true })
    expect(() => parseExtractionResponse(raw)).toThrow(/Invalid response/i)
  })

  it('throws when product is missing', () => {
    const payload = { ...validExtraction, product: undefined }
    const raw = JSON.stringify({ response: JSON.stringify(payload), done: true })
    expect(() => parseExtractionResponse(raw)).toThrow()
  })

  it('throws when manufacturing_cost_per_unit is missing', () => {
    const payload = { ...validExtraction, manufacturing_cost_per_unit: undefined }
    const raw = JSON.stringify({ response: JSON.stringify(payload), done: true })
    expect(() => parseExtractionResponse(raw)).toThrow()
  })

  // Bug 1 — shipping_cost_per_unit must default to null, not 0
  it('returns shipping_cost_per_unit: null when field is absent from parsed JSON', () => {
    const payload = Object.fromEntries(
      Object.entries(validExtraction).filter(([k]) => k !== 'shipping_cost_per_unit')
    )
    const raw = JSON.stringify({ response: JSON.stringify(payload), done: true })
    const result = parseExtractionResponse(raw)
    expect(result.shipping_cost_per_unit).toBeNull()
  })

  it('returns shipping_cost_per_unit: null when field is explicitly null in parsed JSON', () => {
    const payload = { ...validExtraction, shipping_cost_per_unit: null }
    const raw = JSON.stringify({ response: JSON.stringify(payload), done: true })
    const result = parseExtractionResponse(raw)
    expect(result.shipping_cost_per_unit).toBeNull()
  })
})

// ─── extractProductData ───────────────────────────────────────────────────────

describe('extractProductData', () => {
  beforeEach(() => { vi.unstubAllGlobals() })

  it('calls fetch POST to Ollama with model, stream:false, format:json', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({ response: JSON.stringify(validExtraction), done: true })),
    })
    vi.stubGlobal('fetch', mockFetch)
    await extractProductData(baseMessage)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('http://localhost:11434/api/generate')
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body)
    expect(body.model).toBe('llama3.2')
    expect(body.stream).toBe(false)
    expect(body.format).toBe('json')
  })

  it('returns ExtractedProduct on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({ response: JSON.stringify(validExtraction), done: true })),
    }))
    const result = await extractProductData(baseMessage)
    expect(result.product).toBe('Ceramic Mug')
    expect(result.origin_country).toBe('Vietnam')
  })

  it('throws "Could not reach Ollama" on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(extractProductData(baseMessage)).rejects.toThrow(/Could not reach Ollama/i)
  })

  it('throws HTTP status on non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, text: () => Promise.resolve('') }))
    await expect(extractProductData(baseMessage)).rejects.toThrow(/503/)
  })
})

// ─── buildAnalysisPrompt ──────────────────────────────────────────────────────

describe('buildAnalysisPrompt', () => {
  it('includes extracted product name and manufacturing cost', () => {
    const prompt = buildAnalysisPrompt(validExtraction)
    expect(prompt).toContain('Ceramic Mug')
    expect(prompt).toContain('3')
  })

  it('includes origin_country when present', () => {
    const prompt = buildAnalysisPrompt(validExtraction)
    expect(prompt).toContain('Vietnam')
  })

  it('uses fallback text when origin_country is null', () => {
    const prompt = buildAnalysisPrompt({ ...validExtraction, origin_country: null })
    expect(prompt).toContain('unknown')
  })

  it('includes target_retailer when present', () => {
    const prompt = buildAnalysisPrompt(validExtraction)
    expect(prompt).toContain('Walmart')
  })

  it('uses fallback text when target_retailer is null', () => {
    const prompt = buildAnalysisPrompt({ ...validExtraction, target_retailer: null })
    expect(prompt).toContain('generic U.S. retailer')
  })
})

// ─── parseAnalysisResponse ────────────────────────────────────────────────────

describe('parseAnalysisResponse', () => {
  it('returns a complete nested analysis object from a valid response', () => {
    const raw = JSON.stringify({ response: JSON.stringify(validAnalysisPayload), done: true })
    const result = parseAnalysisResponse(raw)
    expect(result.landed_cost_breakdown.total).toBe(4.38)
    expect(result.landed_cost_breakdown.tariff_rate_assumed).toBe('25% — Vietnam home goods HTS 6912.00')
    expect(result.pricing.msrp).toBe(12)
    expect(result.pricing.wholesale_price).toBe(6)
    expect(result.confidence.score).toBe(72)
    expect(result.confidence.label).toBe('Good')
    expect(result.buyer_perspective.decision).toBe('Consider with Negotiation')
    expect(result.buyer_perspective.insights).toHaveLength(2)
    expect(result.assumptions).toHaveLength(2)
  })

  it('throws "Invalid response" when inner response is not valid JSON', () => {
    const raw = JSON.stringify({ response: 'not json', done: true })
    expect(() => parseAnalysisResponse(raw)).toThrow(/Invalid response/i)
  })

  it('throws when a top-level section is missing', () => {
    const withoutPricing = Object.fromEntries(
      Object.entries(validAnalysisPayload).filter(([k]) => k !== 'pricing')
    )
    const raw = JSON.stringify({ response: JSON.stringify(withoutPricing), done: true })
    expect(() => parseAnalysisResponse(raw)).toThrow()
  })

  it('throws when a critical nested field is missing', () => {
    const broken = {
      ...validAnalysisPayload,
      pricing: { wholesale_price: 6, supplier_margin: 27, retail_margin: 50 }, // msrp missing
    }
    const raw = JSON.stringify({ response: JSON.stringify(broken), done: true })
    expect(() => parseAnalysisResponse(raw)).toThrow()
  })
})

// ─── buildAnalysisPrompt — null shipping (Bug 1) ─────────────────────────────

describe('buildAnalysisPrompt — null shipping', () => {
  const nullShipping = { ...validExtraction, shipping_cost_per_unit: null }

  it('renders "unknown" (not "$null" or "$0") when shipping_cost_per_unit is null', () => {
    const prompt = buildAnalysisPrompt(nullShipping)
    expect(prompt).not.toContain('Shipping cost/unit: $null')
    expect(prompt).not.toContain('Shipping cost/unit: $0')
    expect(prompt).toContain('Shipping cost/unit: unknown')
  })

  it('instructs model to add a shipping assumption when shipping is null', () => {
    const prompt = buildAnalysisPrompt(nullShipping)
    expect(prompt).toMatch(/shipping.*assumption|assumption.*shipping/i)
  })
})

// ─── buildAnalysisPrompt — margin formulas (Bug 2) ───────────────────────────

describe('buildAnalysisPrompt — margin formulas', () => {
  it('includes the supplier margin formula', () => {
    const prompt = buildAnalysisPrompt(validExtraction)
    expect(prompt).toContain('(wholesale_price - landed_cost) / wholesale_price')
  })

  it('includes the retail margin formula', () => {
    const prompt = buildAnalysisPrompt(validExtraction)
    expect(prompt).toContain('(msrp - wholesale_price) / msrp')
  })

  it('instructs the model to verify margin consistency before returning JSON', () => {
    const prompt = buildAnalysisPrompt(validExtraction)
    expect(prompt).toMatch(/verify.*margin|margin.*consistent/i)
  })
})

// ─── buildAnalysisPrompt — buyer insight grounding (Bug 3) ───────────────────

describe('buildAnalysisPrompt — buyer insight grounding', () => {
  it('instructs the model to reference exact calculated margin values in buyer_perspective.insights', () => {
    const prompt = buildAnalysisPrompt(validExtraction)
    expect(prompt).toMatch(/supplier_margin.*retail_margin|retail_margin.*supplier_margin/i)
    expect(prompt).toContain('buyer_perspective')
  })

  it('instructs buyer_perspective.decision to be a non-empty string with an example', () => {
    const prompt = buildAnalysisPrompt(validExtraction)
    expect(prompt).toContain('buyer_perspective.decision must be a non-empty string')
  })
})

// ─── buildAnalysisPrompt — retailer margin context ───────────────────────────

describe('buildAnalysisPrompt — retailer margin context', () => {
  it('includes the Walmart margin range when target_retailer is "Walmart"', () => {
    const prompt = buildAnalysisPrompt(validExtraction)
    expect(prompt).toContain('25')
    expect(prompt).toContain('30')
    expect(prompt).toContain('Walmart')
  })

  it('includes the generic default margin range when target_retailer is null', () => {
    const prompt = buildAnalysisPrompt({ ...validExtraction, target_retailer: null })
    expect(prompt).toContain('35')
    expect(prompt).toContain('45')
  })

  it('includes the instruction to penalise confidence when margin is outside the range', () => {
    const prompt = buildAnalysisPrompt(validExtraction)
    expect(prompt).toContain('penalise')
  })
})

// ─── buildAnalysisPrompt — MSRP price floor ──────────────────────────────────

describe('buildAnalysisPrompt — MSRP price floor', () => {
  it('includes the $7 check threshold and $8 floor for home_goods', () => {
    const prompt = buildAnalysisPrompt({ ...validExtraction, category: 'home_goods' })
    expect(prompt).toContain('$7')
    expect(prompt).toContain('$8')
  })

  it('includes home_ceramics in the floor instruction for home_ceramics category', () => {
    const prompt = buildAnalysisPrompt({ ...validExtraction, category: 'home_ceramics' })
    expect(prompt).toContain('home_ceramics')
    expect(prompt).toContain('$7')
    expect(prompt).toContain('$8')
  })

  it('does not include the price floor instruction for clothing', () => {
    const prompt = buildAnalysisPrompt({ ...validExtraction, category: 'clothing' })
    expect(prompt).not.toContain('below $7')
  })
})

// ─── buildAnalysisPrompt — wholesale price formulas (Bug 1) ──────────────────

describe('buildAnalysisPrompt — wholesale price formulas', () => {
  it('includes the formula to derive wholesale_price from landed_cost and supplier_margin', () => {
    const prompt = buildAnalysisPrompt(validExtraction)
    expect(prompt).toContain('landed_cost / (1 - supplier_margin / 100)')
  })

  it('includes the formula to derive msrp from wholesale_price and retail_margin', () => {
    const prompt = buildAnalysisPrompt(validExtraction)
    expect(prompt).toContain('wholesale_price / (1 - retail_margin / 100)')
  })

  it('includes an explicit warning against setting wholesale_price equal to or less than landed_cost', () => {
    const prompt = buildAnalysisPrompt(validExtraction)
    expect(prompt).toMatch(/NEVER set wholesale_price equal to or less than landed_cost/i)
  })
})

// ─── buildAnalysisPrompt — tariff variants ────────────────────────────────────

describe('buildAnalysisPrompt — tariff variants', () => {
  const tariff: TariffResult = {
    hts_code: '6912.00',
    base_rate: 6,
    surcharge: 20,
    total_rate: 26,
    source: 'hts_api',
  }

  it('without tariff still includes "Estimate the HTS tariff rate" instruction', () => {
    const prompt = buildAnalysisPrompt(validExtraction)
    expect(prompt).toContain('Estimate the HTS tariff rate')
  })

  it('with tariff includes "pre-fetched" and the exact rate/code, not the estimate instruction', () => {
    const prompt = buildAnalysisPrompt(validExtraction, tariff)
    expect(prompt).toContain('pre-fetched')
    expect(prompt).toContain('6912.00')
    expect(prompt).toContain('26%')
    expect(prompt).not.toContain('Estimate the HTS tariff rate')
  })

  it('with tariff includes the origin country in the tariff_rate_assumed string', () => {
    const prompt = buildAnalysisPrompt(validExtraction, tariff)
    // validExtraction has origin_country: 'Vietnam'
    expect(prompt).toContain('Vietnam')
    expect(prompt).toContain('6% MFN')
    expect(prompt).toContain('20% surcharge')
  })

  it('fetchAnalysis passes tariff through to the prompt when provided', async () => {
    let capturedBody = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, options: RequestInit) => {
      capturedBody = options.body as string
      return Promise.resolve({
        ok: true, status: 200,
        text: () => Promise.resolve(JSON.stringify({ response: JSON.stringify(validAnalysisPayload), done: true })),
      })
    }))
    await fetchAnalysis(validExtraction, tariff)
    const body = JSON.parse(capturedBody) as { prompt: string }
    expect(body.prompt).toContain('pre-fetched')
    expect(body.prompt).toContain('6912.00')
    vi.unstubAllGlobals()
  })
})

// ─── fetchPricingAnalysis (orchestrator) ──────────────────────────────────────

describe('fetchPricingAnalysis', () => {
  beforeEach(() => { vi.unstubAllGlobals() })

  function makeMockFetch() {
    let callCount = 0
    return vi.fn().mockImplementation(() => {
      callCount++
      const body = callCount === 1
        ? JSON.stringify({ response: JSON.stringify(validExtraction), done: true })
        : JSON.stringify({ response: JSON.stringify(validAnalysisPayload), done: true })
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) })
    })
  }

  it('makes exactly two fetch calls in sequence', async () => {
    const mockFetch = makeMockFetch()
    vi.stubGlobal('fetch', mockFetch)
    await fetchPricingAnalysis(baseMessage)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('returns AIPricingAnalysis merging extraction fields and analysis fields', async () => {
    vi.stubGlobal('fetch', makeMockFetch())
    const result = await fetchPricingAnalysis(baseMessage)
    expect(result.product).toBe('Ceramic Mug')
    expect(result.origin_country).toBe('Vietnam')
    expect(result.target_retailer).toBe('Walmart')
    expect(result.landed_cost_breakdown.total).toBe(4.38)
    expect(result.pricing.msrp).toBe(12)
    expect(result.assumptions).toHaveLength(2)
  })

  it('throws extraction error without making the second call when extraction fails', async () => {
    const errorPayload = { ...validExtraction, error: 'Please describe your product and its costs, e.g. I sell hoodies, cost $6, shipping $2' }
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({ response: JSON.stringify(errorPayload), done: true })),
    })
    vi.stubGlobal('fetch', mockFetch)
    await expect(fetchPricingAnalysis(baseMessage)).rejects.toThrow('Please describe your product and its costs')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
