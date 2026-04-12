import { classifyHTS } from './groq-client'

const HTS_API_BASE = 'https://hts.usitc.gov/reststop/api/details/getrecord'

export interface TariffResult {
  hts_code: string
  base_rate: number
  surcharge: number
  total_rate: number
  source: 'hts_api'
}

export const HTS_CATEGORY_MAP: Record<string, string> = {
  clothing: '6109.10',
  food: '2106.90',
  electronics: '8471.30',
  home_goods: '6912.00',
}

// Surcharges applied on top of MFN base rate (percentage points)
// USMCA countries are handled separately — they skip the API and return 0
const USMCA_COUNTRIES = new Set(['Mexico', 'Canada'])

export const COUNTRY_SURCHARGES: Record<string, number> = {
  China: 25,
  Vietnam: 20,
}

export function buildHtsUrl(htsCode: string): string {
  return `${HTS_API_BASE}?htsno=${encodeURIComponent(htsCode.trim())}`
}

export function parseHtsResponse(raw: unknown): number | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const general = (raw[0] as Record<string, unknown>).general
  if (!general || typeof general !== 'string' || general.trim() === '') return null

  const text = general.trim()
  if (text.toLowerCase() === 'free') return 0

  // Only parse simple "X%" or "X.X%" — reject compound rates
  const match = /^(\d+(?:\.\d+)?)%$/.exec(text)
  if (!match) return null
  return parseFloat(match[1])
}

export async function lookupTariffRate(
  product: string,
  category: string,
  origin_country: string | null,
): Promise<TariffResult | null> {
  if (origin_country === null) return null

  // Step 1: classify via Groq, fall back to category map
  const groqResult = await classifyHTS(product, category)
  const hts_code = groqResult?.hts_code ?? HTS_CATEGORY_MAP[category] ?? null
  if (!hts_code) return null

  // Step 2: USMCA fast-path — real code from Groq, zero rate
  if (USMCA_COUNTRIES.has(origin_country)) {
    return { hts_code, base_rate: 0, surcharge: 0, total_rate: 0, source: 'hts_api' }
  }

  // Step 3: fetch base rate from USITC getrecord
  let response: Response
  try {
    response = await fetch(buildHtsUrl(hts_code))
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

  const base_rate = parseHtsResponse(data)
  if (base_rate === null) return null

  // Step 4: apply country surcharge
  const surcharge = COUNTRY_SURCHARGES[origin_country] ?? 0
  return {
    hts_code,
    base_rate,
    surcharge,
    total_rate: base_rate + surcharge,
    source: 'hts_api',
  }
}
