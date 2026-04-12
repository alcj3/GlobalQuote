import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildExportUrl, parseExportResponse, lookupTariffRate } from './hts-client'
import { classifyHTS } from './groq-client'

vi.mock('./groq-client')

// ─── buildExportUrl ───────────────────────────────────────────────────────────

describe('buildExportUrl', () => {
  it('returns the correct USITC exportList URL for a given HTS code', () => {
    const url = buildExportUrl('6912.00.44.00')
    expect(url).toBe('https://hts.usitc.gov/reststop/exportList?from=6912.00.44.00&to=6912.00.44.00&format=JSON&styles=false')
  })

  it('URL-encodes the HTS code', () => {
    const url = buildExportUrl('6912.00')
    expect(url).toContain('from=6912.00')
    expect(url).toContain('to=6912.00')
  })

  it('trims whitespace from the code before embedding in the URL', () => {
    const url = buildExportUrl('  6912.00  ')
    expect(url).toContain('from=6912.00')
    expect(url).not.toContain(' ')
  })
})

// ─── parseExportResponse ──────────────────────────────────────────────────────

describe('parseExportResponse', () => {
  it('parses "6%" → 6', () => {
    expect(parseExportResponse([{ general: '6%' }])).toBe(6)
  })

  it('parses "Free" → 0', () => {
    expect(parseExportResponse([{ general: 'Free' }])).toBe(0)
  })

  it('parses "6.5%" → 6.5', () => {
    expect(parseExportResponse([{ general: '6.5%' }])).toBe(6.5)
  })

  it('returns null for a compound rate string', () => {
    expect(parseExportResponse([{ general: '6.5¢/kg + 2%' }])).toBeNull()
  })

  it('returns null when the array is empty', () => {
    expect(parseExportResponse([])).toBeNull()
  })

  it('returns null when every item has an empty-string general', () => {
    expect(parseExportResponse([{ general: '' }, { general: '' }])).toBeNull()
  })

  it('skips items with empty general and returns the first item with a valid rate', () => {
    expect(parseExportResponse([{ general: '' }, { htsno: '6912.00.44.00', general: '10%' }])).toBe(10)
  })

  it('returns null when general is missing from all items', () => {
    expect(parseExportResponse([{}, {}])).toBeNull()
  })
})

// ─── lookupTariffRate ─────────────────────────────────────────────────────────

describe('lookupTariffRate', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    // Default: Groq returns a valid classification for home_goods
    vi.mocked(classifyHTS).mockResolvedValue({
      hts_code: '6912.00',
      description: 'Ceramic tableware',
    })
  })

  function mockUsitcFetch(rate: string) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ general: rate }]),
    }))
  }

  it('returns null when origin_country is null', async () => {
    const result = await lookupTariffRate('Ceramic Mug', 'home_goods', null)
    expect(result).toBeNull()
  })

  it('returns TariffResult with base_rate, surcharge, total_rate, source for a standard MFN country', async () => {
    mockUsitcFetch('6%')
    const result = await lookupTariffRate('Ceramic Mug', 'home_goods', 'Japan')
    expect(result).not.toBeNull()
    expect(result!.hts_code).toBe('6912.00')
    expect(result!.base_rate).toBe(6)
    expect(result!.surcharge).toBe(0)
    expect(result!.total_rate).toBe(6)
    expect(result!.source).toBe('hts_api')
  })

  it('applies China surcharge (+25%) on top of MFN base rate', async () => {
    mockUsitcFetch('6%')
    const result = await lookupTariffRate('Ceramic Mug', 'home_goods', 'China')
    expect(result!.base_rate).toBe(6)
    expect(result!.surcharge).toBe(25)
    expect(result!.total_rate).toBe(31)
  })

  it('applies Vietnam surcharge (+20%) on top of MFN base rate', async () => {
    mockUsitcFetch('6%')
    const result = await lookupTariffRate('Ceramic Mug', 'home_goods', 'Vietnam')
    expect(result!.base_rate).toBe(6)
    expect(result!.surcharge).toBe(20)
    expect(result!.total_rate).toBe(26)
  })

  it('returns total_rate: 0 for Mexico (USMCA) without calling the USITC fetch', async () => {
    const mockFn = vi.fn()
    vi.stubGlobal('fetch', mockFn)
    const result = await lookupTariffRate('T-Shirt', 'clothing', 'Mexico')
    expect(result).not.toBeNull()
    expect(result!.total_rate).toBe(0)
    expect(result!.base_rate).toBe(0)
    expect(result!.surcharge).toBe(0)
    expect(result!.source).toBe('hts_api')
    expect(mockFn).not.toHaveBeenCalled()
  })

  it('returns null on USITC network failure without rethrowing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const result = await lookupTariffRate('Ceramic Mug', 'home_goods', 'Vietnam')
    expect(result).toBeNull()
  })

  it('returns null on USITC non-200 response without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const result = await lookupTariffRate('Ceramic Mug', 'home_goods', 'Vietnam')
    expect(result).toBeNull()
  })

  it('falls back to HTS_CATEGORY_MAP when classifyHTS returns null', async () => {
    vi.mocked(classifyHTS).mockResolvedValueOnce(null)
    mockUsitcFetch('6%')
    const result = await lookupTariffRate('Ceramic Mug', 'home_goods', 'Japan')
    expect(result).not.toBeNull()
    // Falls back to JSON category map; validate format rather than a specific code
    expect(result!.hts_code).toMatch(/^\d{4}\.\d{2}/)
    expect(result!.base_rate).toBe(6)
  })

  it('falls back to JSON map for home_ceramics category when classifyHTS returns null', async () => {
    vi.mocked(classifyHTS).mockResolvedValueOnce(null)
    mockUsitcFetch('10%')
    const result = await lookupTariffRate('Ceramic Mug', 'home_ceramics', 'Japan')
    expect(result).not.toBeNull()
    expect(result!.hts_code).toMatch(/^\d{4}\.\d{2}/)
    expect(result!.base_rate).toBe(10)
  })

  it('returns null when classifyHTS returns null and category has no map entry', async () => {
    vi.mocked(classifyHTS).mockResolvedValueOnce(null)
    const result = await lookupTariffRate('Unknown widget', 'unmapped_category', 'Japan')
    expect(result).toBeNull()
  })

  it('returns USMCA result with real hts_code from Groq and total_rate: 0', async () => {
    vi.mocked(classifyHTS).mockResolvedValueOnce({
      hts_code: '6109.10.00',
      description: 'Cotton T-shirts',
    })
    const mockFn = vi.fn()
    vi.stubGlobal('fetch', mockFn)
    const result = await lookupTariffRate('T-Shirt', 'clothing', 'Canada')
    expect(result!.hts_code).toBe('6109.10.00')
    expect(result!.total_rate).toBe(0)
    expect(mockFn).not.toHaveBeenCalled()
  })

  it('returns null when exportList returns 0 results and no category map entry exists', async () => {
    vi.mocked(classifyHTS).mockResolvedValueOnce(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    }))
    const result = await lookupTariffRate('Unknown widget', 'other', 'Japan')
    expect(result).toBeNull()
  })

  it('returns null when exportList returns results but all have empty general', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ htsno: '', general: '' }, { htsno: '', general: '' }]),
    }))
    const result = await lookupTariffRate('Ceramic Mug', 'home_goods', 'Japan')
    expect(result).toBeNull()
  })
})
