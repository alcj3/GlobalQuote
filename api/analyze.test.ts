import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildExtractionMessages,
  parseGroqExtraction,
  buildAnalysisMessages,
  parseGroqAnalysis,
} from './analyze'
import type { ExtractedProduct } from '../src/services/ollama-client'
import type { TariffResult } from '../src/services/hts-client'

const baseMessage = 'I sell hoodies from Vietnam, manufacturing cost $6, shipping $2, 1000 units, Target'

const validExtracted: ExtractedProduct = {
  product: 'Hoodie',
  category: 'clothing',
  origin_country: 'Vietnam',
  manufacturing_cost_per_unit: 6,
  shipping_cost_per_unit: 2,
  quantity: 1000,
  target_retailer: 'Target',
  additional_costs_per_unit: null,
  error: null,
}

const validTariff: TariffResult = {
  hts_code: '6110.20',
  base_rate: 16.5,
  surcharge: 20,
  total_rate: 36.5,
  source: 'category_map',
}

const validAnalysisContent = JSON.stringify({
  landed_cost_breakdown: {
    manufacturing: 6,
    shipping: 2,
    tariff_rate_assumed: '36.5% — HTS 6110.20',
    tariff_cost: 2.19,
    additional: 0,
    total: 10.19,
  },
  pricing: {
    msrp: 32,
    wholesale_price: 15,
    supplier_margin: 32.0,
    retail_margin: 53.0,
  },
  confidence: { score: 78, label: 'Good', explanation: 'Solid margins.' },
  buyer_perspective: {
    decision: 'Proceed',
    insights: ['Good margin for Target'],
    action: 'Submit quote.',
  },
  assumptions: ['Tariff from HTS map'],
})

// ─── buildExtractionMessages ──────────────────────────────────────────────────

describe('buildExtractionMessages', () => {
  it('includes the user message in the user role message', () => {
    const messages = buildExtractionMessages(baseMessage)
    const userMsg = messages.find(m => m.role === 'user')
    expect(userMsg?.content).toContain(baseMessage)
  })

  it('includes all 9 required field names in system content', () => {
    const messages = buildExtractionMessages(baseMessage)
    const systemMsg = messages.find(m => m.role === 'system')
    const fields = [
      'product', 'category', 'origin_country',
      'manufacturing_cost_per_unit', 'shipping_cost_per_unit',
      'quantity', 'target_retailer', 'additional_costs_per_unit', 'error',
    ]
    for (const field of fields) {
      expect(systemMsg?.content).toContain(field)
    }
  })

  it('instructs shipping_cost_per_unit to null when not determinable', () => {
    const messages = buildExtractionMessages(baseMessage)
    const systemMsg = messages.find(m => m.role === 'system')
    expect(systemMsg?.content).toMatch(/shipping.*null|null.*shipping/i)
  })
})

// ─── parseGroqExtraction ──────────────────────────────────────────────────────

describe('parseGroqExtraction', () => {
  it('parses valid Groq JSON content into ExtractedProduct', () => {
    const content = JSON.stringify(validExtracted)
    const result = parseGroqExtraction(content)
    expect(result.product).toBe('Hoodie')
    expect(result.category).toBe('clothing')
    expect(result.manufacturing_cost_per_unit).toBe(6)
    expect(result.error).toBeNull()
  })

  it('throws when error field is non-null', () => {
    const content = JSON.stringify({ ...validExtracted, error: 'Please describe your product' })
    expect(() => parseGroqExtraction(content)).toThrow('Please describe your product')
  })

  it('throws "Invalid response" when content is not valid JSON', () => {
    expect(() => parseGroqExtraction('not json')).toThrow(/Invalid response/i)
  })

  it('returns shipping_cost_per_unit: null when field is absent', () => {
    const payload = Object.fromEntries(
      Object.entries(validExtracted).filter(([k]) => k !== 'shipping_cost_per_unit')
    )
    const result = parseGroqExtraction(JSON.stringify(payload))
    expect(result.shipping_cost_per_unit).toBeNull()
  })
})

// ─── buildAnalysisMessages ────────────────────────────────────────────────────

describe('buildAnalysisMessages', () => {
  it('includes the tariff rate in the system message when tariff is provided', () => {
    const messages = buildAnalysisMessages(validExtracted, validTariff)
    const systemMsg = messages.find(m => m.role === 'system')
    expect(systemMsg?.content).toContain('36.5')
    expect(systemMsg?.content).toContain('6110.20')
  })

  it('includes the retailer margin context in the system message', () => {
    const messages = buildAnalysisMessages(validExtracted, validTariff)
    const systemMsg = messages.find(m => m.role === 'system')
    expect(systemMsg?.content).toContain('Target')
    expect(systemMsg?.content).toMatch(/40.*50|50.*40/i)
  })

  it('includes all required output fields in the schema', () => {
    const messages = buildAnalysisMessages(validExtracted, validTariff)
    const systemMsg = messages.find(m => m.role === 'system')
    const required = [
      'landed_cost_breakdown', 'pricing', 'confidence',
      'buyer_perspective', 'assumptions',
    ]
    for (const field of required) {
      expect(systemMsg?.content).toContain(field)
    }
  })

  it('includes the clothing MSRP floor instruction for clothing category', () => {
    const messages = buildAnalysisMessages(validExtracted, validTariff)
    const systemMsg = messages.find(m => m.role === 'system')
    expect(systemMsg?.content).toContain('clothing')
    expect(systemMsg?.content).toMatch(/\$19|\$20/)
  })

  it('includes the home_goods MSRP floor instruction for home_goods category', () => {
    const homeGoods = { ...validExtracted, category: 'home_goods' }
    const messages = buildAnalysisMessages(homeGoods, validTariff)
    const systemMsg = messages.find(m => m.role === 'system')
    expect(systemMsg?.content).toContain('home_goods')
    expect(systemMsg?.content).toMatch(/\$7|\$8/)
  })

  it('sets tariff_cost = manufacturing * (rate/100) instruction', () => {
    const messages = buildAnalysisMessages(validExtracted, validTariff)
    const systemMsg = messages.find(m => m.role === 'system')
    expect(systemMsg?.content).toContain('manufacturing_cost_per_unit')
    expect(systemMsg?.content).toMatch(/total_rate.*100|duty base/i)
  })
})

// ─── parseGroqAnalysis ────────────────────────────────────────────────────────

describe('parseGroqAnalysis', () => {
  it('parses valid Groq JSON content into analysis payload', () => {
    const result = parseGroqAnalysis(validAnalysisContent)
    expect(result.landed_cost_breakdown.total).toBe(10.19)
    expect(result.pricing.msrp).toBe(32)
    expect(result.confidence.score).toBe(78)
  })

  it('throws when a required top-level section is missing', () => {
    const broken = JSON.stringify({ landed_cost_breakdown: {}, pricing: {} })
    expect(() => parseGroqAnalysis(broken)).toThrow(/missing required section/i)
  })

  it('throws when landed_cost_breakdown.total is missing', () => {
    const parsed = JSON.parse(validAnalysisContent)
    delete parsed.landed_cost_breakdown.total
    expect(() => parseGroqAnalysis(JSON.stringify(parsed))).toThrow(/total/i)
  })

  it('throws when pricing.msrp is missing', () => {
    const parsed = JSON.parse(validAnalysisContent)
    delete parsed.pricing.msrp
    expect(() => parseGroqAnalysis(JSON.stringify(parsed))).toThrow(/msrp/i)
  })
})

// ─── handler integration (mocked fetch) ──────────────────────────────────────

describe('handler', () => {
  beforeEach(() => { vi.unstubAllGlobals() })

  it('returns 400 when message is missing', async () => {
    const { default: handler } = await import('./analyze')
    const jsonFn = vi.fn()
    const statusFn = vi.fn(() => ({ json: jsonFn }))
    const req = { method: 'POST', body: {} } as never
    const res = { status: statusFn, json: vi.fn() } as never
    await handler(req, res)
    expect(statusFn).toHaveBeenCalledWith(400)
  })

  it('returns 405 for non-POST requests', async () => {
    const { default: handler } = await import('./analyze')
    const jsonFn = vi.fn()
    const statusFn = vi.fn(() => ({ json: jsonFn }))
    const req = { method: 'GET', body: {} } as never
    const res = { status: statusFn, json: vi.fn() } as never
    await handler(req, res)
    expect(statusFn).toHaveBeenCalledWith(405)
  })
})
