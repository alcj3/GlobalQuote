import { useState } from 'react'
import { PriceInputForm } from './components/price-input-form'
import { PricingResults } from './components/pricing-results'
import { fetchPricingAnalysis } from './services/ollama-client'
import type { AIPricingAnalysis } from './services/ollama-client'
import type { CostInputs } from './types'
import './App.css'

function App() {
  const [analysis, setAnalysis] = useState<AIPricingAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(inputs: CostInputs) {
    setLoading(true)
    setError(null)
    setAnalysis(null)
    try {
      const result = await fetchPricingAnalysis(inputs)
      setAnalysis(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
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
            <PriceInputForm onSubmit={handleSubmit} disabled={loading} />
          </div>
          {error && (
            <div className="card-section error-banner" role="alert">
              <strong>Error:</strong> {error}
            </div>
          )}
          <div className="card-section">
            {loading
              ? <p className="results-placeholder">Analyzing your product...</p>
              : <PricingResults analysis={analysis} />
            }
          </div>
        </div>
      </main>
    </>
  )
}

export default App
