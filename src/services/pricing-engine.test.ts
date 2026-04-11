import { describe, it, expect } from 'vitest'
import {
  calculateTotalCost,
  calculateRetailRange,
  applyMSRPRounding,
  calculateMSRP,
  calculateWholesale,
  calculateMargins,
  generatePricingAnalysis,
} from './pricing-engine'

describe('calculateTotalCost', () => {
  it('sums manufacturing, shipping, and additional costs', () => {
    expect(calculateTotalCost(10, 2, 3)).toBe(15)
  })

  it('treats missing additionalCosts as 0', () => {
    expect(calculateTotalCost(10, 2)).toBe(12)
  })
})

describe('calculateRetailRange', () => {
  it('returns [25, 40] for clothing with totalCost 10', () => {
    expect(calculateRetailRange('clothing', 10)).toEqual([25, 40])
  })

  it('returns [120, 250] for electronics with totalCost 100', () => {
    expect(calculateRetailRange('electronics', 100)).toEqual([120, 250])
  })
})

describe('applyMSRPRounding', () => {
  it('snaps to .99 in $30–$100 band for 32.5', () => {
    expect(applyMSRPRounding(32.5)).toBe(32.99)
  })

  it('snaps to .99 under $30 for 8.75', () => {
    expect(applyMSRPRounding(8.75)).toBe(8.99)
  })

  it('rounds to nearest $5 above $100 for 225', () => {
    expect(applyMSRPRounding(225)).toBe(225)
  })

  it('rounds to nearest $5 above $100 for 163', () => {
    expect(applyMSRPRounding(163)).toBe(165)
  })
})

describe('calculateMSRP', () => {
  it('applies psychological rounding for clothing with totalCost 10', () => {
    // raw = 10 * 3.25 = 32.5 → floor(32) + 0.99 = 32.99
    expect(calculateMSRP('clothing', 10)).toBe(32.99)
  })

  it('applies above-$100 rounding for electronics with totalCost 100', () => {
    // raw = 100 * 1.85 = 185 → nearest $5 = 185
    expect(calculateMSRP('electronics', 100)).toBe(185)
  })
})

describe('calculateWholesale', () => {
  it('returns 50 for MSRP 100', () => {
    expect(calculateWholesale(100)).toBe(50)
  })

  it('returns 16.5 for MSRP 33', () => {
    // 33 * 0.5 = 16.5 — exactly .5, keep it
    expect(calculateWholesale(33)).toBe(16.5)
  })

  it('returns 25 for MSRP 49.99', () => {
    // 49.99 * 0.5 = 24.995 → Math.round(49.99) / 2 = 50 / 2 = 25
    expect(calculateWholesale(49.99)).toBe(25)
  })
})

describe('calculateMargins', () => {
  it('calculates retail 50% and supplier 60%', () => {
    const { retailMargin, supplierMargin } = calculateMargins(100, 50, 20)
    expect(retailMargin).toBe(50.0)
    expect(supplierMargin).toBe(60.0)
  })

  it('returns supplier margin 0 when wholesale equals totalCost', () => {
    const { supplierMargin } = calculateMargins(100, 50, 50)
    expect(supplierMargin).toBe(0)
  })
})

describe('generatePricingAnalysis', () => {
  it('produces correct full object for clothing mfg=10 ship=2 additional=0', () => {
    const result = generatePricingAnalysis({
      productName: 'Test Jacket',
      category: 'clothing',
      manufacturingCost: 10,
      shippingCost: 2,
      additionalCosts: 0,
    })
    expect(result.totalCost).toBe(12)
    expect(result.retailPriceMin).toBe(30)
    expect(result.retailPriceMax).toBe(48)
    // raw = 12 * 3.25 = 39 → floor(39) + 0.99 = 39.99
    expect(result.msrp).toBe(39.99)
    // Math.round(39.99) / 2 = 40 / 2 = 20
    expect(result.wholesalePrice).toBe(20)
    expect(result.assumptions).toEqual([])
  })

  it('adds assumption string when additionalCosts is not provided', () => {
    const result = generatePricingAnalysis({
      productName: 'Test',
      category: 'food',
      manufacturingCost: 5,
      shippingCost: 1,
    })
    expect(result.assumptions).toContain('Additional costs assumed $0')
  })

  it('MSRP and wholesale never have complex decimals', () => {
    // food, mfg=7, ship=1 → totalCost=8 → raw=8*2.25=18 → 18.99; wholesale=Math.round(18.99)/2=19/2=9.5
    const result = generatePricingAnalysis({
      productName: 'Test',
      category: 'food',
      manufacturingCost: 7,
      shippingCost: 1,
      additionalCosts: 0,
    })
    const msrpStr = result.msrp.toString()
    const wsStr = result.wholesalePrice.toString()
    const validMSRP = !msrpStr.includes('.') || msrpStr.endsWith('.99') || msrpStr.endsWith('.5')
    const validWholesale = !wsStr.includes('.') || wsStr.endsWith('.5')
    expect(validMSRP).toBe(true)
    expect(validWholesale).toBe(true)
  })
})
