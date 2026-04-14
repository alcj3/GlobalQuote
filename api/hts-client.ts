export interface TariffResult {
  hts_code: string
  base_rate: number
  surcharge: number
  total_rate: number
  source: 'category_map'
}

const HTS_CATEGORY_MAP: Record<string, { hts_code: string; general_rate: string }> = {
  clothing:            { hts_code: '6109.10', general_rate: '16.5%' },
  clothing_tops:       { hts_code: '6109.10', general_rate: '16.5%' },
  clothing_bottoms:    { hts_code: '6203.42', general_rate: '16.6%' },
  clothing_outerwear:  { hts_code: '6201.92', general_rate: '16.4%' },
  food:                { hts_code: '2106.90', general_rate: '6.4%' },
  food_processed:      { hts_code: '2106.90', general_rate: '6.4%' },
  food_beverages:      { hts_code: '2202.99', general_rate: 'Free' },
  electronics:         { hts_code: '8471.30', general_rate: 'Free' },
  electronics_computers:   { hts_code: '8471.30', general_rate: 'Free' },
  electronics_phones:      { hts_code: '8517.12', general_rate: 'Free' },
  electronics_accessories: { hts_code: '8518.29', general_rate: '4.9%' },
  home_goods:          { hts_code: '6912.00', general_rate: '10%' },
  home_ceramics:       { hts_code: '6912.00', general_rate: '10%' },
  home_furniture:      { hts_code: '9403.60', general_rate: 'Free' },
  home_textiles:       { hts_code: '6302.21', general_rate: '6.7%' },
  footwear:            { hts_code: '6403.99', general_rate: '8.5%' },
  bags_luggage:        { hts_code: '4202.22', general_rate: '9%' },
  toys_games:          { hts_code: '9503.00', general_rate: 'Free' },
  sporting_goods:      { hts_code: '9506.91', general_rate: '4%' },
  jewelry:             { hts_code: '7113.19', general_rate: '7%' },
  cosmetics:           { hts_code: '3304.99', general_rate: 'Free' },
  other:               { hts_code: '3926.90', general_rate: '5.3%' },
}

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
