import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Category, CostInputs } from '../services/pricing-engine'
import './price-input-form.css'

interface Props {
  onSubmit: (inputs: CostInputs) => void
}

interface Errors {
  productName?: string
  manufacturingCost?: string
}

export function PriceInputForm({ onSubmit }: Props) {
  const [productName, setProductName] = useState('')
  const [category, setCategory] = useState<Category>('clothing')
  const [manufacturingCost, setManufacturingCost] = useState('')
  const [shippingCost, setShippingCost] = useState('')
  const [additionalCosts, setAdditionalCosts] = useState('')
  const [errors, setErrors] = useState<Errors>({})

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const newErrors: Errors = {}
    if (!productName.trim()) {
      newErrors.productName = 'Product name is required'
    }
    if (!manufacturingCost) {
      newErrors.manufacturingCost = 'Manufacturing cost is required'
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setErrors({})
    onSubmit({
      productName: productName.trim(),
      category,
      manufacturingCost: parseFloat(manufacturingCost),
      shippingCost: parseFloat(shippingCost) || 0,
      additionalCosts: parseFloat(additionalCosts) || 0,
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="form-section-title">Product Details</h2>

      <div className="form-field">
        <label className="form-label" htmlFor="productName">
          Product Name
        </label>
        <input
          className="form-input"
          id="productName"
          type="text"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
        />
        {errors.productName && (
          <span className="form-error" role="alert">
            {errors.productName}
          </span>
        )}
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="category">
          Category
        </label>
        <select
          className="form-select"
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
        >
          <option value="clothing">Clothing</option>
          <option value="food">Food</option>
          <option value="electronics">Electronics</option>
          <option value="home_goods">Home Goods</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="form-cost-group">
        <p className="form-cost-group-title">Cost Inputs (USD)</p>

        <div className="form-field">
          <label className="form-label" htmlFor="manufacturingCost">
            Manufacturing Cost
          </label>
          <input
            className="form-input"
            id="manufacturingCost"
            type="number"
            min="0"
            value={manufacturingCost}
            onChange={(e) => setManufacturingCost(e.target.value)}
          />
          {errors.manufacturingCost && (
            <span className="form-error" role="alert">
              {errors.manufacturingCost}
            </span>
          )}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="shippingCost">
            Shipping Cost
          </label>
          <input
            className="form-input"
            id="shippingCost"
            type="number"
            min="0"
            value={shippingCost}
            onChange={(e) => setShippingCost(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="additionalCosts">
            Additional Costs (optional)
          </label>
          <input
            className="form-input"
            id="additionalCosts"
            type="number"
            min="0"
            value={additionalCosts}
            onChange={(e) => setAdditionalCosts(e.target.value)}
          />
        </div>
      </div>

      <button className="form-submit" type="submit">
        Calculate Pricing
      </button>
    </form>
  )
}
