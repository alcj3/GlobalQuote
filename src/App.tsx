import { useState } from 'react'
import { PriceInputForm } from './components/price-input-form'
import { PricingResults } from './components/pricing-results'
import { generatePricingAnalysis } from './services/pricing-engine'
import type { CostInputs, PricingAnalysis } from './services/pricing-engine'
import './App.css'

function App() {
  const [analysis, setAnalysis] = useState<PricingAnalysis | null>(null)

  function handleSubmit(inputs: CostInputs) {
    setAnalysis(generatePricingAnalysis(inputs))
  }

  return (
    <>
      <header className="app-header">
        <h1>GlobalQuote</h1>
        <p>Pricing for the U.S. market</p>
      </header>
      <main className="app-main">
        <div className="card">
          <div className="card-section">
            <PriceInputForm onSubmit={handleSubmit} />
          </div>
          <div className="card-section">
            <PricingResults analysis={analysis} />
          </div>
        </div>
      </main>
    </>
  )
}

export default App
