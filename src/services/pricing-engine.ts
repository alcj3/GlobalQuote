export type Category = 'clothing' | 'food' | 'electronics' | 'home_goods' | 'other'

export interface CostInputs {
  productName: string
  category: Category
  manufacturingCost: number
  shippingCost: number
  additionalCosts: number
}

export interface PricingAnalysis {
  productName: string
  category: Category
  totalCost: number
  retailPriceMin: number
  retailPriceMax: number
  msrp: number
  wholesalePrice: number
  retailMargin: number
  supplierMargin: number
  assumptions: string[]
}

const MULTIPLIERS: Record<Category, { min: number; max: number; mid: number }> = {
  clothing: { min: 2.5, max: 4.0, mid: 3.25 },
  food: { min: 1.5, max: 3.0, mid: 2.25 },
  electronics: { min: 1.2, max: 2.5, mid: 1.85 },
  home_goods: { min: 2.0, max: 3.5, mid: 2.75 },
  other: { min: 2.0, max: 3.0, mid: 2.5 },
}

export function calculateTotalCost(
  manufacturingCost: number,
  shippingCost: number,
  additionalCosts: number = 0,
): number {
  return manufacturingCost + shippingCost + additionalCosts
}

export function applyMSRPRounding(raw: number): number {
  if (raw <= 100) {
    return Math.floor(raw) + 0.99
  }
  return Math.round(raw / 5) * 5
}

export function calculateRetailRange(
  category: Category,
  totalCost: number,
): [number, number] {
  const { min, max } = MULTIPLIERS[category]
  return [Math.round(totalCost * min), Math.round(totalCost * max)]
}

export function calculateMSRP(category: Category, totalCost: number): number {
  const { mid } = MULTIPLIERS[category]
  return applyMSRPRounding(totalCost * mid)
}

export function calculateWholesale(msrp: number): number {
  return Math.round(msrp) / 2
}

export function calculateMargins(
  msrp: number,
  wholesale: number,
  totalCost: number,
): { retailMargin: number; supplierMargin: number } {
  const retailMargin = parseFloat(((msrp - wholesale) / msrp * 100).toFixed(1))
  const supplierMargin =
    wholesale <= totalCost
      ? 0
      : parseFloat(((wholesale - totalCost) / wholesale * 100).toFixed(1))
  return { retailMargin, supplierMargin }
}

export function generatePricingAnalysis(
  inputs: Omit<CostInputs, 'additionalCosts'> & { additionalCosts?: number },
): PricingAnalysis {
  const assumptions: string[] = []
  const additionalCosts = inputs.additionalCosts ?? 0
  if (inputs.additionalCosts === undefined) {
    assumptions.push('Additional costs assumed $0')
  }

  const totalCost = calculateTotalCost(
    inputs.manufacturingCost,
    inputs.shippingCost,
    additionalCosts,
  )
  const [retailPriceMin, retailPriceMax] = calculateRetailRange(inputs.category, totalCost)
  const msrp = calculateMSRP(inputs.category, totalCost)
  const wholesalePrice = calculateWholesale(msrp)
  const { retailMargin, supplierMargin } = calculateMargins(msrp, wholesalePrice, totalCost)

  return {
    productName: inputs.productName,
    category: inputs.category,
    totalCost,
    retailPriceMin,
    retailPriceMax,
    msrp,
    wholesalePrice,
    retailMargin,
    supplierMargin,
    assumptions,
  }
}
