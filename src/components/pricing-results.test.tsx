import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PricingResults } from './pricing-results'
import type { AIPricingAnalysis } from '../services/ollama-client'

const baseAnalysis: AIPricingAnalysis = {
  product: 'Ceramic Mug',
  category: 'home_goods',
  origin_country: 'Vietnam',
  quantity: 1000,
  target_retailer: 'Walmart',
  landed_cost_breakdown: {
    manufacturing: 3,
    shipping: 0.5,
    tariff_rate_assumed: '25% — Vietnam home goods HTS 6912.00',
    tariff_cost: 0.88,
    additional: 0,
    total: 4.38,
  },
  pricing: {
    msrp: 12,
    wholesale_price: 6,
    supplier_margin: 27.0,
    retail_margin: 50.0,
  },
  confidence: {
    score: 72,
    label: 'Good',
    explanation: 'Solid margins despite tariff exposure.',
  },
  buyer_perspective: {
    decision: 'Consider with Negotiation',
    insights: ['Tariff exposure is a concern', 'Price point competitive for Walmart'],
    action: 'Negotiate manufacturing cost below $2.50.',
  },
  assumptions: [
    'Assumed 25% tariff rate for Vietnam ceramics under HTS 6912.00',
    'Additional costs assumed $0',
  ],
}

describe('PricingResults', () => {
  it('renders Details section with product, category, origin, quantity, retailer', () => {
    const { container } = render(<PricingResults analysis={baseAnalysis} />)
    expect(container.textContent).toContain('Ceramic Mug')
    expect(container.textContent).toContain('home_goods')
    expect(container.textContent).toContain('Vietnam')
    expect(container.textContent).toContain('1,000')
    expect(container.textContent).toContain('Walmart')
  })

  it('renders landed cost breakdown with all rows', () => {
    const { container } = render(<PricingResults analysis={baseAnalysis} />)
    expect(container.textContent).toMatch(/manufacturing/i)
    expect(container.textContent).toMatch(/shipping/i)
    expect(container.textContent).toMatch(/tariff/i)
    expect(container.textContent).toMatch(/total/i)
  })

  it('renders the tariff rate assumed as text', () => {
    render(<PricingResults analysis={baseAnalysis} />)
    expect(screen.getByText('25% — Vietnam home goods HTS 6912.00')).toBeTruthy()
  })

  it('renders pricing section with MSRP and wholesale', () => {
    const { container } = render(<PricingResults analysis={baseAnalysis} />)
    expect(container.textContent).toMatch(/msrp/i)
    expect(container.textContent).toMatch(/wholesale/i)
  })

  it('renders supplier and retail margins formatted as XX.X%', () => {
    render(<PricingResults analysis={baseAnalysis} />)
    expect(screen.getByText('27.0%')).toBeTruthy()
    expect(screen.getByText('50.0%')).toBeTruthy()
  })

  it('does not render confidence score, label, or explanation', () => {
    const { container } = render(<PricingResults analysis={baseAnalysis} />)
    expect(container.textContent).not.toContain('72')
    expect(container.textContent).not.toContain('Good')
    expect(container.textContent).not.toContain('Solid margins despite tariff exposure.')
  })

  it('renders buyer perspective decision, insights, and action', () => {
    render(<PricingResults analysis={baseAnalysis} />)
    expect(screen.getByText(/consider with negotiation/i)).toBeTruthy()
    expect(screen.getByText('Tariff exposure is a concern')).toBeTruthy()
    expect(screen.getByText('Negotiate manufacturing cost below $2.50.')).toBeTruthy()
  })

  it('renders assumptions section with each assumption as a list item', () => {
    render(<PricingResults analysis={baseAnalysis} />)
    expect(screen.getByText('Assumed 25% tariff rate for Vietnam ceramics under HTS 6912.00')).toBeTruthy()
    expect(screen.getByText('Additional costs assumed $0')).toBeTruthy()
  })

  it('renders placeholder when analysis is null', () => {
    render(<PricingResults analysis={null} />)
    expect(screen.getByText(/enter your costs/i)).toBeTruthy()
  })

  it('renders "—" in Buyer Decision row when decision is an empty string', () => {
    const emptyDecision = {
      ...baseAnalysis,
      buyer_perspective: { ...baseAnalysis.buyer_perspective, decision: '' },
    }
    render(<PricingResults analysis={emptyDecision} />)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('applies ledger-value class to all landed cost breakdown values', () => {
    render(<PricingResults analysis={baseAnalysis} />)
    const section = screen.getByText('Landed Cost Breakdown').closest('.results-section')
    const dds = section!.querySelectorAll('dd')
    expect(dds.length).toBeGreaterThan(0)
    dds.forEach(dd => expect(dd.className).toContain('ledger-value'))
  })

  it('applies ledger-value class to suggested pricing values', () => {
    render(<PricingResults analysis={baseAnalysis} />)
    const section = screen.getByText('Suggested Pricing').closest('.results-section')
    const dds = section!.querySelectorAll('dd')
    expect(dds.length).toBeGreaterThan(0)
    dds.forEach(dd => expect(dd.className).toContain('ledger-value'))
  })

  it('applies ledger-value class to margin values', () => {
    render(<PricingResults analysis={baseAnalysis} />)
    const section = screen.getByText('Margins').closest('.results-section')
    const dds = section!.querySelectorAll('dd')
    expect(dds.length).toBeGreaterThan(0)
    dds.forEach(dd => expect(dd.className).toContain('ledger-value'))
  })
})
