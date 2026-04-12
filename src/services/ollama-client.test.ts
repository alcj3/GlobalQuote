import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPrompt, parseOllamaResponse, fetchPricingAnalysis } from './ollama-client'
import type { CostInputs } from '../types'

const baseInputs: CostInputs = {
  productName: 'Test Widget',
  category: 'electronics',
  manufacturingCost: 50,
  shippingCost: 10,
  additionalCosts: 5,
}

const validOllamaPayload = {
  landed_cost: 65,
  msrp: 120,
  wholesale_price: 60,
  supplier_margin: 8.0,
  retail_margin: 50.0,
  confidence_score: 82,
  confidence_label: 'Good',
  confidence_explanation: 'Margins are healthy and pricing is competitive.',
  buyer_decision: 'Strong Buy',
  buyer_insights: ['Competitive price point', 'Strong margin for retailers'],
  buyer_action: 'List at MSRP immediately.',
}

describe('buildPrompt', () => {
  it('includes product name, category, and all three cost fields', () => {
    const prompt = buildPrompt(baseInputs)
    expect(prompt).toContain('Test Widget')
    expect(prompt).toContain('electronics')
    expect(prompt).toContain('50')
    expect(prompt).toContain('10')
    expect(prompt).toContain('5')
  })

  it('includes additionalCosts field even when value is 0', () => {
    const prompt = buildPrompt({ ...baseInputs, additionalCosts: 0 })
    expect(prompt).toContain('0')
  })
})

describe('parseOllamaResponse', () => {
  it('returns a complete AIPricingAnalysis from a valid Ollama response', () => {
    const raw = JSON.stringify({ response: JSON.stringify(validOllamaPayload), done: true })
    const result = parseOllamaResponse(raw, baseInputs)
    expect(result.landed_cost).toBe(65)
    expect(result.msrp).toBe(120)
    expect(result.wholesale_price).toBe(60)
    expect(result.confidence_score).toBe(82)
    expect(result.confidence_label).toBe('Good')
    expect(result.buyer_decision).toBe('Strong Buy')
    expect(result.buyer_insights).toEqual(['Competitive price point', 'Strong margin for retailers'])
    expect(result.buyer_action).toBe('List at MSRP immediately.')
    expect(result.productName).toBe('Test Widget')
    expect(result.category).toBe('electronics')
  })

  it('throws containing "Invalid response" when response field is not valid JSON', () => {
    const raw = JSON.stringify({ response: 'not json at all', done: true })
    expect(() => parseOllamaResponse(raw, baseInputs)).toThrow(/Invalid response/i)
  })

  it('throws when required fields are missing from the parsed object', () => {
    const incomplete = { landed_cost: 65, msrp: 120 } // missing most fields
    const raw = JSON.stringify({ response: JSON.stringify(incomplete), done: true })
    expect(() => parseOllamaResponse(raw, baseInputs)).toThrow()
  })
})

describe('fetchPricingAnalysis', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls fetch with POST to the Ollama endpoint with correct body shape', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ response: JSON.stringify(validOllamaPayload), done: true })),
    })
    vi.stubGlobal('fetch', mockFetch)

    await fetchPricingAnalysis(baseInputs)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('http://localhost:11434/api/generate')
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body)
    expect(body.model).toBe('llama3.2')
    expect(body.stream).toBe(false)
    expect(body.format).toBe('json')
  })

  it('returns parsed AIPricingAnalysis with productName and category echoed from inputs', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ response: JSON.stringify(validOllamaPayload), done: true })),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchPricingAnalysis(baseInputs)
    expect(result.productName).toBe('Test Widget')
    expect(result.category).toBe('electronics')
    expect(result.msrp).toBe(120)
  })

  it('throws containing "Could not reach Ollama" on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(fetchPricingAnalysis(baseInputs)).rejects.toThrow(/Could not reach Ollama/i)
  })

  it('throws containing the HTTP status on a non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('Service Unavailable'),
    }))

    await expect(fetchPricingAnalysis(baseInputs)).rejects.toThrow(/503/)
  })
})
