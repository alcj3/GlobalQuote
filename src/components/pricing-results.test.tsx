import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PricingResults } from './pricing-results'
import type { PricingAnalysis } from '../services/pricing-engine'

const baseAnalysis: PricingAnalysis = {
  productName: 'Test Widget',
  category: 'electronics',
  totalCost: 50,
  retailPriceMin: 60,
  retailPriceMax: 120,
  msrp: 49.99,
  wholesalePrice: 25,
  retailMargin: 50.0,
  supplierMargin: 0.0,
  assumptions: [],
}

describe('PricingResults', () => {
  it('renders all output labels', () => {
    render(<PricingResults analysis={baseAnalysis} />)
    expect(screen.getByText(/product/i)).toBeTruthy()
    expect(screen.getByText(/category/i)).toBeTruthy()
    expect(screen.getByText(/total cost/i)).toBeTruthy()
    expect(screen.getByText(/msrp/i)).toBeTruthy()
    expect(screen.getByText(/wholesale/i)).toBeTruthy()
    expect(screen.getByText(/retail margin/i)).toBeTruthy()
    expect(screen.getByText(/supplier margin/i)).toBeTruthy()
  })

  it('formats whole-dollar, .99, and .5 prices correctly', () => {
    const analysis: PricingAnalysis = {
      ...baseAnalysis,
      retailPriceMax: 120,
      msrp: 49.99,
      wholesalePrice: 12.5,
    }
    const { container } = render(<PricingResults analysis={analysis} />)
    expect(container.textContent).toContain('$120')    // whole dollar — no decimals
    expect(container.textContent).toContain('$49.99')  // .99 price
    expect(container.textContent).toContain('$12.50')  // .5 price renders as two decimal places
  })

  it('formats margins as XX.X%', () => {
    render(
      <PricingResults
        analysis={{ ...baseAnalysis, retailMargin: 50.0, supplierMargin: 33.3 }}
      />,
    )
    expect(screen.getByText('50.0%')).toBeTruthy()
    expect(screen.getByText('33.3%')).toBeTruthy()
  })

  it('shows retail price range containing both min and max', () => {
    render(
      <PricingResults
        analysis={{ ...baseAnalysis, retailPriceMin: 60, retailPriceMax: 120 }}
      />,
    )
    const { container } = render(
      <PricingResults
        analysis={{ ...baseAnalysis, retailPriceMin: 60, retailPriceMax: 120 }}
      />,
    )
    expect(container.textContent).toMatch(/\$60.+\$120/)
  })

  it('renders assumptions section when non-empty', () => {
    render(
      <PricingResults
        analysis={{ ...baseAnalysis, assumptions: ['Additional costs assumed $0'] }}
      />,
    )
    expect(screen.getByText('Additional costs assumed $0')).toBeTruthy()
  })

  it('renders placeholder when passed null', () => {
    render(<PricingResults analysis={null} />)
    expect(screen.getByText(/enter your costs/i)).toBeTruthy()
  })
})
