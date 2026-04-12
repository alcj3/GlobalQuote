const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export interface HTSClassification {
  hts_code: string
  description: string
}

export function buildGroqRequest(product: string, category: string): object {
  return {
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content:
          'You are a U.S. HTS tariff classification expert. Given a product name and category, return the most specific applicable 8-digit HTS code.\n\nReturn ONLY this JSON, no prose, no markdown:\n{"hts_code": "<8-digit code>", "description": "<brief product description>"}',
      },
      {
        role: 'user',
        content: `Product: ${product}\nCategory: ${category}`,
      },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  }
}

export function parseGroqResponse(raw: unknown): HTSClassification | null {
  const res = raw as { choices?: Array<{ message?: { content?: string } }> }
  if (!Array.isArray(res.choices) || res.choices.length === 0) return null

  const content = res.choices[0]?.message?.content
  if (!content) return null

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content) as Record<string, unknown>
  } catch {
    return null
  }

  if (!parsed.hts_code || typeof parsed.hts_code !== 'string') return null
  if (!/^\d{4}\.\d{2}/.test(parsed.hts_code)) return null

  return {
    hts_code: parsed.hts_code,
    description: typeof parsed.description === 'string' ? parsed.description : '',
  }
}

export async function classifyHTS(product: string, category: string): Promise<HTSClassification | null> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY
  if (!apiKey) return null

  let response: Response
  try {
    response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildGroqRequest(product, category)),
    })
  } catch {
    return null
  }

  if (!response.ok) return null

  let data: unknown
  try {
    data = await response.json()
  } catch {
    return null
  }

  return parseGroqResponse(data)
}
