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
    productName,
    category,
    landed_cost,
    msrp,
    wholesale_price,
    supplier_margin,
    retail_margin,
    confidence_score,
    confidence_label,
    confidence_explanation,
    buyer_decision,
    buyer_insights,
    buyer_action,
  } = analysis

  return (
    <section aria-label="Pricing Analysis">
      <h2 className="results-heading">Pricing Analysis</h2>

      <div className="results-section">
        <h3 className="results-section-title">Details</h3>
        <dl className="results-dl">
          <div className="results-row">
            <dt>Product Name</dt>
            <dd>{productName}</dd>
          </div>
          <div className="results-row">
            <dt>Category</dt>
            <dd>{category}</dd>
          </div>
        </dl>
      </div>

      <div className="results-section">
        <h3 className="results-section-title">Cost Breakdown</h3>
        <dl className="results-dl">
          <div className="results-row">
            <dt>Landed Cost</dt>
            <dd>{formatPrice(landed_cost)}</dd>
          </div>
        </dl>
      </div>

      <div className="results-section">
        <h3 className="results-section-title">Suggested Pricing</h3>
        <dl className="results-dl">
          <div className="results-row results-row-msrp">
            <dt>Suggested Retail Price (MSRP)</dt>
            <dd>{formatPrice(msrp)}</dd>
          </div>
          <div className="results-row">
            <dt>Suggested Wholesale Price</dt>
            <dd>{formatPrice(wholesale_price)}</dd>
          </div>
        </dl>
      </div>

      <div className="results-section">
        <h3 className="results-section-title">Margins</h3>
        <dl className="results-dl">
          <div className="results-row">
            <dt>Estimated Retail Margin</dt>
            <dd>{formatMargin(retail_margin)}</dd>
          </div>
          <div className="results-row">
            <dt>Supplier Margin</dt>
            <dd>{formatMargin(supplier_margin)}</dd>
          </div>
        </dl>
      </div>

      <div className="results-section">
        <h3 className="results-section-title">AI Confidence</h3>
        <div className={`confidence-badge confidence-badge--${confidence_label.toLowerCase()}`}>
          <span className="confidence-score">{confidence_score}</span>
          <span className="confidence-label">{confidence_label}</span>
        </div>
        <p className="confidence-explanation">{confidence_explanation}</p>
      </div>

      <div className="results-section">
        <h3 className="results-section-title">Buyer Intelligence</h3>
        <dl className="results-dl">
          <div className="results-row">
            <dt>Buyer Decision</dt>
            <dd>{buyer_decision}</dd>
          </div>
        </dl>
        <ul className="buyer-insights">
          {buyer_insights.map((insight, i) => (
            <li key={i}>{insight}</li>
          ))}
        </ul>
        <p className="buyer-action">{buyer_action}</p>
      </div>
    </section>
  )
}
