import { useState } from 'react'
import { PriceInputForm } from './components/price-input-form'
import { PricingResults } from './components/pricing-results'
import { fetchPricingAnalysis } from './services/ollama-client'
import type { AIPricingAnalysis } from './services/ollama-client'
import './App.css'

function App() {
  const [analysis, setAnalysis] = useState<AIPricingAnalysis | null>(null)
  const [loadingPhase, setLoadingPhase] = useState<'analyzing' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(message: string) {
    setLoadingPhase('analyzing')
    setError(null)

    const hardTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Analysis timed out. Please try again.')), 90_000)
    )

    try {
      const result = await Promise.race([fetchPricingAnalysis(message), hardTimeout])
      setAnalysis(result)
    } catch (err) {
      setAnalysis(null)
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoadingPhase(null)
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
            <PriceInputForm onSubmit={handleSubmit} disabled={loadingPhase !== null} />
          </div>
          {error && (
            <div className="card-section error-banner" role="alert">
              <strong>Error:</strong> {error}
            </div>
          )}
          <div className="card-section">
            {loadingPhase
              ? <p className="results-placeholder">Running pricing analysis...</p>
              : <PricingResults analysis={analysis} />
            }
          </div>
        </div>
      </main>
    </>
  )
}

export default App
