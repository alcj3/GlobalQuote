import { describe, it, expect } from 'vitest'
import { getRetailerMargins } from './retailer-config'

describe('getRetailerMargins', () => {
  it('returns Walmart margins (25–30%) for "Walmart"', () => {
    const result = getRetailerMargins('Walmart')
    expect(result.name).toBe('Walmart')
    expect(result.min_margin).toBe(25)
    expect(result.max_margin).toBe(30)
  })

  it('returns Target margins (40–50%) for "Target"', () => {
    const result = getRetailerMargins('Target')
    expect(result.name).toBe('Target')
    expect(result.min_margin).toBe(40)
    expect(result.max_margin).toBe(50)
  })

  it('returns Costco margins (14–15%) for "Costco"', () => {
    const result = getRetailerMargins('Costco')
    expect(result.name).toBe('Costco')
    expect(result.min_margin).toBe(14)
    expect(result.max_margin).toBe(15)
  })

  it('returns Whole Foods margins (35–40%) for "Whole Foods"', () => {
    const result = getRetailerMargins('Whole Foods')
    expect(result.name).toBe('Whole Foods')
    expect(result.min_margin).toBe(35)
    expect(result.max_margin).toBe(40)
  })

  it('returns generic default (35–45%) for null', () => {
    const result = getRetailerMargins(null)
    expect(result.min_margin).toBe(35)
    expect(result.max_margin).toBe(45)
  })

  it('returns generic default for an unknown retailer string', () => {
    const result = getRetailerMargins('Kroger')
    expect(result.min_margin).toBe(35)
    expect(result.max_margin).toBe(45)
  })

  it('match is case-insensitive: "walmart" returns Walmart margins', () => {
    const result = getRetailerMargins('walmart')
    expect(result.name).toBe('Walmart')
    expect(result.min_margin).toBe(25)
  })

  it('match is case-insensitive: "WHOLE FOODS" returns Whole Foods margins', () => {
    const result = getRetailerMargins('WHOLE FOODS')
    expect(result.name).toBe('Whole Foods')
    expect(result.min_margin).toBe(35)
  })
})
