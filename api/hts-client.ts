import htsCategoryMapData from './hts-category-map.json'

export interface TariffResult {
  hts_code: string
  base_rate: number
  surcharge: number
  total_rate: number
  source: 'category_map'
}

type CategoryMapEntry = { hts_code: string; general_rate: string; description: string }
const HTS_CATEGORY_MAP: Record<string, { hts_code: string; general_rate: string }> = Object.fromEntries(
  (Object.entries(htsCategoryMapData) as [string, CategoryMapEntry][]).map(([k, v]) => [
    k,
    { hts_code: v.hts_code, general_rate: v.general_rate },
  ]),
)

const USMCA_COUNTRIES = new Set(['Mexico', 'Canada'])

export const COUNTRY_SURCHARGES: Record<string, number> = {
  China: 25,
  Vietnam: 20,
}

function parseRateString(rate: string): number | null {
  const text = rate.trim()
  if (text.toLowerCase() === 'free') return 0
  const match = /^(\d+(?:\.\d+)?)%$/.exec(text)
  if (match) return parseFloat(match[1])
  return null
}

export function lookupTariffRate(
  category: string,
  origin_country: string | null,
): TariffResult | null {
  if (origin_country === null) return null

  const entry = HTS_CATEGORY_MAP[category] ?? null
  if (!entry) return null

  const { hts_code } = entry

  if (USMCA_COUNTRIES.has(origin_country)) {
    return { hts_code, base_rate: 0, surcharge: 0, total_rate: 0, source: 'category_map' }
  }

  const base_rate = parseRateString(entry.general_rate)
  if (base_rate === null) return null

  const surcharge = COUNTRY_SURCHARGES[origin_country] ?? 0
  return {
    hts_code,
    base_rate,
    surcharge,
    total_rate: base_rate + surcharge,
    source: 'category_map',
  }
}
