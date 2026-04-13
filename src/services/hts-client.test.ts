import { describe, it, expect } from 'vitest'
import { lookupTariffRate } from './hts-client'

// ─── lookupTariffRate ─────────────────────────────────────────────────────────

describe('lookupTariffRate', () => {
  it('returns null when origin_country is null', async () => {
    const result = await lookupTariffRate('home_goods', null)
    expect(result).toBeNull()
  })

  it('returns null when category has no map entry', async () => {
    const result = await lookupTariffRate('unmapped_category', 'Japan')
    expect(result).toBeNull()
  })

  it('returns TariffResult with correct base_rate, hts_code, and source for MFN country', async () => {
    const result = await lookupTariffRate('home_goods', 'Japan')
    expect(result).not.toBeNull()
    expect(result!.hts_code).toBe('6912.00')
    expect(result!.base_rate).toBe(10)
    expect(result!.surcharge).toBe(0)
    expect(result!.total_rate).toBe(10)
    expect(result!.source).toBe('category_map')
  })

  it('applies China surcharge (+25%) on top of map rate', async () => {
    const result = await lookupTariffRate('home_goods', 'China')
    expect(result!.base_rate).toBe(10)
    expect(result!.surcharge).toBe(25)
    expect(result!.total_rate).toBe(35)
  })

  it('applies Vietnam surcharge (+20%) on top of map rate', async () => {
    const result = await lookupTariffRate('home_goods', 'Vietnam')
    expect(result!.base_rate).toBe(10)
    expect(result!.surcharge).toBe(20)
    expect(result!.total_rate).toBe(30)
  })

  it('returns total_rate: 0 for USMCA country (Mexico)', async () => {
    const result = await lookupTariffRate('clothing', 'Mexico')
    expect(result).not.toBeNull()
    expect(result!.base_rate).toBe(0)
    expect(result!.surcharge).toBe(0)
    expect(result!.total_rate).toBe(0)
    expect(result!.source).toBe('category_map')
  })

  it('returns total_rate: 0 for USMCA country (Canada)', async () => {
    const result = await lookupTariffRate('clothing', 'Canada')
    expect(result).not.toBeNull()
    expect(result!.total_rate).toBe(0)
  })

  it('handles "Free" general_rate from map (electronics)', async () => {
    const result = await lookupTariffRate('electronics', 'Japan')
    expect(result).not.toBeNull()
    expect(result!.base_rate).toBe(0)
    expect(result!.surcharge).toBe(0)
    expect(result!.total_rate).toBe(0)
  })
})
