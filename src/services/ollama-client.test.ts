import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchPricingAnalysis } from './ollama-client'
import type { AIPricingAnalysis } from './ollama-client'

const baseMessage = 'I sell hoodies from Vietnam, manufacturing cost $6, shipping $2, 1000 units, Target'

const validAnalysis: AIPricingAnalysis = {
  product: 'Hoodie',
  category: 'clothing',
  origin_country: 'Vietnam',
  quantity: 1000,
  target_retailer: 'Target',
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
}

describe('fetchPricingAnalysis', () => {
  beforeEach(() => { vi.unstubAllGlobals() })

  it('calls POST /api/analyze with the message in the body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validAnalysis),
    })
    vi.stubGlobal('fetch', mockFetch)
    await fetchPricingAnalysis(baseMessage)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/analyze')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body as string)).toEqual({ message: baseMessage })
  })

  it('returns AIPricingAnalysis on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validAnalysis),
    }))
    const result = await fetchPricingAnalysis(baseMessage)
    expect(result.product).toBe('Hoodie')
    expect(result.pricing.msrp).toBe(32)
  })

  it('throws "Pricing service unavailable" when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(fetchPricingAnalysis(baseMessage)).rejects.toThrow('Pricing service unavailable')
  })

  it('throws "Pricing service unavailable" on non-OK HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal error' }),
    }))
    await expect(fetchPricingAnalysis(baseMessage)).rejects.toThrow('Pricing service unavailable')
  })

  it('throws the error string when response JSON contains { error: string }', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Please describe your product and its costs' }),
    }))
    await expect(fetchPricingAnalysis(baseMessage)).rejects.toThrow(
      'Please describe your product and its costs'
    )
  })
})
