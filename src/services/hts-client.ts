import { classifyHTS } from './groq-client'
import htsCategoryMapData from './hts-category-map.json'

const HTS_EXPORT_BASE = 'https://hts.usitc.gov/reststop/exportList'

export interface TariffResult {
  hts_code: string
  base_rate: number
  surcharge: number
  total_rate: number
  source: 'hts_api'
}

type CategoryMapEntry = { hts_code: string; general_rate: string; description: string }
const HTS_CATEGORY_MAP: Record<string, string> = Object.fromEntries(
  (Object.entries(htsCategoryMapData) as [string, CategoryMapEntry][]).map(([k, v]) => [k, v.hts_code]),
)

// Surcharges applied on top of MFN base rate (percentage points)
// USMCA countries are handled separately — they skip the API and return 0
const USMCA_COUNTRIES = new Set(['Mexico', 'Canada'])

export const COUNTRY_SURCHARGES: Record<string, number> = {
  China: 25,
  Vietnam: 20,
}

export function buildExportUrl(htsCode: string): string {
  const code = encodeURIComponent(htsCode.trim())
  return `${HTS_EXPORT_BASE}?from=${code}&to=${code}&format=JSON&styles=false`
}

export function parseExportResponse(raw: unknown): number | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  for (const item of raw) {
    const general = (item as Record<string, unknown>).general
    if (!general || typeof general !== 'string' || general.trim() === '') continue
    const text = general.trim()
    if (text.toLowerCase() === 'free') return 0
    const match = /^(\d+(?:\.\d+)?)%$/.exec(text)
    if (match) return parseFloat(match[1])
  }
  return null
}

export async function lookupTariffRate(
  product: string,
  category: string,
  origin_country: string | null,
): Promise<TariffResult | null> {
  if (origin_country === null) return null

  // Step 1: classify via Groq, fall back to JSON category map
  const groqResult = await classifyHTS(product, category)
  const hts_code = groqResult?.hts_code ?? HTS_CATEGORY_MAP[category] ?? null
  if (!hts_code) return null

  // Step 2: USMCA fast-path — real code from Groq, zero rate
  if (USMCA_COUNTRIES.has(origin_country)) {
    return { hts_code, base_rate: 0, surcharge: 0, total_rate: 0, source: 'hts_api' }
  }

  // Step 3: fetch base rate from USITC exportList
  let response: Response
  try {
    response = await fetch(buildExportUrl(hts_code))
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

  const base_rate = parseExportResponse(data)
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
