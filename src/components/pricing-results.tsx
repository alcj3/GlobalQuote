import type { AIPricingAnalysis } from '../services/ollama-client'
import './pricing-results.css'

function formatPrice(price: number): string {
  if (Number.isInteger(price)) return `$${price}`
  return `$${price.toFixed(2)}`
}

function formatMargin(margin: number): string {
  return `${margin.toFixed(1)}%`
}

interface Props {
  analysis: AIPricingAnalysis | null
}

export function PricingResults({ analysis }: Props) {
  if (!analysis) {
    return <p className="results-placeholder">Enter your costs above to see a pricing analysis.</p>
  }

  const {
    product,
    category,
    origin_country,
    quantity,
    target_retailer,
    landed_cost_breakdown,
    pricing,
    confidence,
    buyer_perspective,
    assumptions,
  } = analysis

  return (
    <section aria-label="Pricing Analysis">
      <h2 className="results-heading">Pricing Analysis</h2>

      <div className="results-section">
        <h3 className="results-section-title">Details</h3>
        <dl className="results-dl">
          <div className="results-row">
            <dt>Product</dt>
            <dd>{product}</dd>
          </div>
          <div className="results-row">
            <dt>Category</dt>
            <dd>{category}</dd>
          </div>
          {origin_country && (
            <div className="results-row">
              <dt>Origin Country</dt>
              <dd>{origin_country}</dd>
            </div>
          )}
          {quantity !== null && (
            <div className="results-row">
              <dt>Quantity</dt>
              <dd>{quantity.toLocaleString()} units</dd>
            </div>
          )}
          {target_retailer && (
            <div className="results-row">
              <dt>Target Retailer</dt>
              <dd>{target_retailer}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="results-section">
        <h3 className="results-section-title">Landed Cost Breakdown</h3>
        <dl className="results-dl">
          <div className="results-row">
            <dt>Manufacturing</dt>
            <dd>{formatPrice(landed_cost_breakdown.manufacturing)}</dd>
          </div>
          <div className="results-row">
            <dt>Shipping</dt>
            <dd>{formatPrice(landed_cost_breakdown.shipping)}</dd>
          </div>
          <div className="results-row results-row-tariff">
            <dt>
              Tariff
              <span className="results-tariff-rate">{landed_cost_breakdown.tariff_rate_assumed}</span>
            </dt>
            <dd>{formatPrice(landed_cost_breakdown.tariff_cost)}</dd>
          </div>
          {landed_cost_breakdown.additional > 0 && (
            <div className="results-row">
              <dt>Additional</dt>
              <dd>{formatPrice(landed_cost_breakdown.additional)}</dd>
            </div>
          )}
          <div className="results-row results-row-total">
            <dt>Total Landed Cost</dt>
            <dd>{formatPrice(landed_cost_breakdown.total)}</dd>
          </div>
        </dl>
      </div>

      <div className="results-section">
        <h3 className="results-section-title">Suggested Pricing</h3>
        <dl className="results-dl">
          <div className="results-row results-row-msrp">
            <dt>Suggested Retail Price (MSRP)</dt>
            <dd>{formatPrice(pricing.msrp)}</dd>
          </div>
          <div className="results-row">
            <dt>Suggested Wholesale Price</dt>
            <dd>{formatPrice(pricing.wholesale_price)}</dd>
          </div>
        </dl>
      </div>

      <div className="results-section">
        <h3 className="results-section-title">Margins</h3>
        <dl className="results-dl">
          <div className="results-row">
            <dt>Estimated Retail Margin</dt>
            <dd>{formatMargin(pricing.retail_margin)}</dd>
          </div>
          <div className="results-row">
            <dt>Supplier Margin</dt>
            <dd>{formatMargin(pricing.supplier_margin)}</dd>
          </div>
        </dl>
      </div>

      <div className="results-section">
        <h3 className="results-section-title">AI Confidence</h3>
        <div className={`confidence-badge confidence-badge--${confidence.label.toLowerCase()}`}>
          <span className="confidence-score">{confidence.score}</span>
          <span className="confidence-label">{confidence.label}</span>
        </div>
        <p className="confidence-explanation">{confidence.explanation}</p>
      </div>

      <div className="results-section">
        <h3 className="results-section-title">Buyer Intelligence</h3>
        <dl className="results-dl">
          <div className="results-row">
            <dt>Buyer Decision</dt>
            <dd>{buyer_perspective.decision || '—'}</dd>
          </div>
        </dl>
        <ul className="buyer-insights">
          {buyer_perspective.insights.map((insight, i) => (
            <li key={i}>{insight}</li>
          ))}
        </ul>
        <p className="buyer-action">{buyer_perspective.action}</p>
      </div>

      {assumptions.length > 0 && (
        <div className="results-section results-assumptions">
          <h3 className="results-section-title">Assumptions</h3>
          <ul className="assumptions-list">
            {assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
