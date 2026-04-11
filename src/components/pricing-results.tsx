import type { PricingAnalysis } from '../services/pricing-engine'
import './pricing-results.css'

function formatPrice(price: number): string {
  if (Number.isInteger(price)) return `$${price}`
  return `$${price.toFixed(2)}`
}

function formatMargin(margin: number): string {
  return `${margin.toFixed(1)}%`
}

interface Props {
  analysis: PricingAnalysis | null
}

export function PricingResults({ analysis }: Props) {
  if (!analysis) {
    return <p className="results-placeholder">Enter your costs above to see a pricing analysis.</p>
  }

  const {
    productName,
    category,
    totalCost,
    retailPriceMin,
    retailPriceMax,
    msrp,
    wholesalePrice,
    retailMargin,
    supplierMargin,
    assumptions,
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
            <dt>Total Cost</dt>
            <dd>{formatPrice(totalCost)}</dd>
          </div>
        </dl>
      </div>

      <div className="results-section">
        <h3 className="results-section-title">Suggested Pricing</h3>
        <dl className="results-dl">
          <div className="results-row">
            <dt>Estimated Retail Price Range</dt>
            <dd data-testid="retail-range">
              {formatPrice(retailPriceMin)} – {formatPrice(retailPriceMax)}
            </dd>
          </div>
          <div className="results-row results-row-msrp">
            <dt>Suggested Retail Price (MSRP)</dt>
            <dd>{formatPrice(msrp)}</dd>
          </div>
          <div className="results-row">
            <dt>Suggested Wholesale Price</dt>
            <dd>{formatPrice(wholesalePrice)}</dd>
          </div>
        </dl>
      </div>

      <div className="results-section">
        <h3 className="results-section-title">Margins</h3>
        <dl className="results-dl">
          <div className="results-row">
            <dt>Estimated Retail Margin</dt>
            <dd>{formatMargin(retailMargin)}</dd>
          </div>
          <div className="results-row">
            <dt>Supplier Margin</dt>
            <dd>{formatMargin(supplierMargin)}</dd>
          </div>
        </dl>
      </div>

      {assumptions.length > 0 && (
        <div className="results-assumptions">
          <h3 className="results-assumptions-title">Assumptions</h3>
          <ul>
            {assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
