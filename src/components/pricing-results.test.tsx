import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PricingResults } from './pricing-results'
import type { AIPricingAnalysis } from '../services/ollama-client'

const baseAnalysis: AIPricingAnalysis = {
  productName: 'Test Widget',
  category: 'electronics',
  landed_cost: 65,
  msrp: 120,
  wholesale_price: 60,
  supplier_margin: 8.3,
  retail_margin: 50.0,
  confidence_score: 82,
  confidence_label: 'Good',
  confidence_explanation: 'Margins are healthy and pricing is competitive for the U.S. market.',
  buyer_decision: 'Strong Buy',
  buyer_insights: ['Competitive price point', 'Strong margin for retailers'],
  buyer_action: 'List at MSRP immediately.',
}

describe('PricingResults', () => {
  it('renders landed cost, MSRP, and wholesale price labels', () => {
    const { container } = render(<PricingResults analysis={baseAnalysis} />)
    expect(container.textContent).toMatch(/landed cost/i)
    expect(container.textContent).toMatch(/msrp/i)
    expect(container.textContent).toMatch(/wholesale/i)
  })

  it('renders retail margin and supplier margin formatted as XX.X%', () => {
    render(<PricingResults analysis={baseAnalysis} />)
    expect(screen.getByText('50.0%')).toBeTruthy()
    expect(screen.getByText('8.3%')).toBeTruthy()
  })

  it('renders confidence score as a number and confidence label as text', () => {
    const { container } = render(<PricingResults analysis={baseAnalysis} />)
    expect(container.textContent).toContain('82')
    expect(screen.getByText(/good/i)).toBeTruthy()
  })

  it('renders confidence explanation text', () => {
    render(<PricingResults analysis={baseAnalysis} />)
    expect(screen.getByText(/margins are healthy/i)).toBeTruthy()
  })

  it('renders buyer decision text', () => {
    render(<PricingResults analysis={baseAnalysis} />)
    expect(screen.getByText(/strong buy/i)).toBeTruthy()
  })

  it('renders each buyer insight as a list item', () => {
    render(<PricingResults analysis={baseAnalysis} />)
    expect(screen.getByText('Competitive price point')).toBeTruthy()
    expect(screen.getByText('Strong margin for retailers')).toBeTruthy()
  })

  it('renders buyer action text', () => {
    render(<PricingResults analysis={baseAnalysis} />)
    expect(screen.getByText('List at MSRP immediately.')).toBeTruthy()
  })

  it('renders placeholder when analysis is null', () => {
    render(<PricingResults analysis={null} />)
    expect(screen.getByText(/enter your costs/i)).toBeTruthy()
  })
})
