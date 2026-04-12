import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPrompt, parseOllamaResponse, fetchPricingAnalysis } from './ollama-client'

const baseMessage = 'I sell electronics widgets, manufacturing cost $50, shipping $10, additional $5'

const validOllamaPayload = {
  productName: 'Electronics Widget',
  category: 'electronics',
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
  it('includes the user message in the prompt', () => {
    const prompt = buildPrompt(baseMessage)
    expect(prompt).toContain(baseMessage)
  })

  it('includes the validation error instruction with the fallback error message', () => {
    const prompt = buildPrompt(baseMessage)
    expect(prompt).toContain('"error"')
    expect(prompt).toContain('Please describe your product and its costs')
  })
})

describe('parseOllamaResponse', () => {
  it('throws with the Ollama error message when response contains an error field', () => {
    const raw = JSON.stringify({ response: JSON.stringify({ error: 'Please describe your product and its costs, e.g. I sell hoodies, cost $6, shipping $2' }), done: true })
    expect(() => parseOllamaResponse(raw)).toThrow('Please describe your product and its costs, e.g. I sell hoodies, cost $6, shipping $2')
  })

  it('throws on error field even when other pricing fields are also present', () => {
    const raw = JSON.stringify({ response: JSON.stringify({ error: 'Please describe your product and its costs, e.g. I sell hoodies, cost $6, shipping $2', msrp: 100 }), done: true })
    expect(() => parseOllamaResponse(raw)).toThrow('Please describe your product and its costs')
  })

  it('returns a complete AIPricingAnalysis from a valid Ollama response', () => {
    const raw = JSON.stringify({ response: JSON.stringify(validOllamaPayload), done: true })
    const result = parseOllamaResponse(raw)
    expect(result.landed_cost).toBe(65)
    expect(result.msrp).toBe(120)
    expect(result.wholesale_price).toBe(60)
    expect(result.confidence_score).toBe(82)
    expect(result.confidence_label).toBe('Good')
    expect(result.buyer_decision).toBe('Strong Buy')
    expect(result.buyer_insights).toEqual(['Competitive price point', 'Strong margin for retailers'])
    expect(result.buyer_action).toBe('List at MSRP immediately.')
  })

  it('returns productName and category from the parsed response', () => {
    const raw = JSON.stringify({ response: JSON.stringify(validOllamaPayload), done: true })
    const result = parseOllamaResponse(raw)
    expect(result.productName).toBe('Electronics Widget')
    expect(result.category).toBe('electronics')
  })

  it('throws containing "Invalid response" when response field is not valid JSON', () => {
    const raw = JSON.stringify({ response: 'not json at all', done: true })
    expect(() => parseOllamaResponse(raw)).toThrow(/Invalid response/i)
  })

  it('throws when required fields are missing from the parsed object', () => {
    const incomplete = { productName: 'Widget', landed_cost: 65, msrp: 120 }
    const raw = JSON.stringify({ response: JSON.stringify(incomplete), done: true })
    expect(() => parseOllamaResponse(raw)).toThrow()
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

    await fetchPricingAnalysis(baseMessage)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('http://localhost:11434/api/generate')
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body)
    expect(body.model).toBe('llama3.2')
    expect(body.stream).toBe(false)
    expect(body.format).toBe('json')
  })

  it('returns parsed AIPricingAnalysis with productName and category from the response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ response: JSON.stringify(validOllamaPayload), done: true })),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchPricingAnalysis(baseMessage)
    expect(result.productName).toBe('Electronics Widget')
    expect(result.category).toBe('electronics')
    expect(result.msrp).toBe(120)
  })

  it('rejects with the Ollama error message when response is a validation error', async () => {
    const validationError = { error: 'Please describe your product and its costs, e.g. I sell hoodies, cost $6, shipping $2' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ response: JSON.stringify(validationError), done: true })),
    }))

    await expect(fetchPricingAnalysis(baseMessage)).rejects.toThrow('Please describe your product and its costs')
  })

  it('throws containing "Could not reach Ollama" on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(fetchPricingAnalysis(baseMessage)).rejects.toThrow(/Could not reach Ollama/i)
  })

  it('throws containing the HTTP status on a non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('Service Unavailable'),
    }))

    await expect(fetchPricingAnalysis(baseMessage)).rejects.toThrow(/503/)
  })
})
