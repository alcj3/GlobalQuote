import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildGroqRequest, parseGroqResponse, classifyHTS } from './groq-client'

const validGroqResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({ hts_code: '6912.00.10', description: 'Ceramic tableware' }),
      },
    },
  ],
}

// ─── buildGroqRequest ─────────────────────────────────────────────────────────

describe('buildGroqRequest', () => {
  it('includes the product name in the user message', () => {
    const req = buildGroqRequest('Ceramic Mug', 'home_goods') as {
      messages: Array<{ role: string; content: string }>
    }
    const userMsg = req.messages.find((m) => m.role === 'user')
    expect(userMsg?.content).toContain('Ceramic Mug')
  })

  it('includes the category in the user message', () => {
    const req = buildGroqRequest('Ceramic Mug', 'home_goods') as {
      messages: Array<{ role: string; content: string }>
    }
    const userMsg = req.messages.find((m) => m.role === 'user')
    expect(userMsg?.content).toContain('home_goods')
  })

  it('uses model llama-3.3-70b-versatile', () => {
    const req = buildGroqRequest('Ceramic Mug', 'home_goods') as { model: string }
    expect(req.model).toBe('llama-3.3-70b-versatile')
  })

  it('sets temperature: 0 and response_format.type: "json_object"', () => {
    const req = buildGroqRequest('Ceramic Mug', 'home_goods') as {
      temperature: number
      response_format: { type: string }
    }
    expect(req.temperature).toBe(0)
    expect(req.response_format.type).toBe('json_object')
  })

  it('system prompt includes 6912 to correctly classify ceramic tableware', () => {
    const req = buildGroqRequest('Ceramic Mug', 'home_goods') as {
      messages: Array<{ role: string; content: string }>
    }
    const sysMsg = req.messages.find((m) => m.role === 'system')
    expect(sysMsg?.content).toContain('6912')
  })

  it('system prompt includes NOT 6906 to prevent misclassification as ceramic pipes', () => {
    const req = buildGroqRequest('Ceramic Mug', 'home_goods') as {
      messages: Array<{ role: string; content: string }>
    }
    const sysMsg = req.messages.find((m) => m.role === 'system')
    expect(sysMsg?.content).toContain('NOT 6906')
  })
})

// ─── parseGroqResponse ────────────────────────────────────────────────────────

describe('parseGroqResponse', () => {
  it('returns HTSClassification from a valid OpenAI-format response', () => {
    const result = parseGroqResponse(validGroqResponse)
    expect(result).not.toBeNull()
    expect(result!.hts_code).toBe('6912.00.10')
    expect(result!.description).toBe('Ceramic tableware')
  })

  it('returns null when choices array is empty', () => {
    expect(parseGroqResponse({ choices: [] })).toBeNull()
  })

  it('returns null when content is not valid JSON', () => {
    expect(
      parseGroqResponse({ choices: [{ message: { content: 'not json' } }] }),
    ).toBeNull()
  })

  it('returns null when hts_code is missing from parsed content', () => {
    const raw = { choices: [{ message: { content: JSON.stringify({ description: 'something' }) } }] }
    expect(parseGroqResponse(raw)).toBeNull()
  })

  it('returns null when hts_code does not match minimum HTS format', () => {
    const raw = { choices: [{ message: { content: JSON.stringify({ hts_code: 'INVALID', description: 'test' }) } }] }
    expect(parseGroqResponse(raw)).toBeNull()
  })
})

// ─── classifyHTS ──────────────────────────────────────────────────────────────

describe('classifyHTS', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GROQ_API_KEY', 'test-api-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('calls the Groq endpoint with the correct URL and Authorization: Bearer header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validGroqResponse),
    })
    vi.stubGlobal('fetch', mockFetch)

    await classifyHTS('Ceramic Mug', 'home_goods')

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer test-api-key')
  })

  it('returns null on network failure without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const result = await classifyHTS('Ceramic Mug', 'home_goods')
    expect(result).toBeNull()
  })

  it('returns null on non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    const result = await classifyHTS('Ceramic Mug', 'home_goods')
    expect(result).toBeNull()
  })
})
