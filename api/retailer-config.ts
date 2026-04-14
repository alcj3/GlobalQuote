export interface RetailerMargins {
  name: string
  min_margin: number
  max_margin: number
}

const GENERIC_DEFAULT: RetailerMargins = {
  name: 'Generic Retailer',
  min_margin: 35,
  max_margin: 45,
}

export const RETAILER_MARGINS: Record<string, RetailerMargins> = {
  walmart: { name: 'Walmart', min_margin: 25, max_margin: 30 },
  target: { name: 'Target', min_margin: 40, max_margin: 50 },
  costco: { name: 'Costco', min_margin: 14, max_margin: 15 },
  'whole foods': { name: 'Whole Foods', min_margin: 35, max_margin: 40 },
}

export function getRetailerMargins(retailer: string | null): RetailerMargins {
  if (!retailer) return GENERIC_DEFAULT
  return RETAILER_MARGINS[retailer.toLowerCase()] ?? GENERIC_DEFAULT
}
