import { useState } from 'react'
import { PriceInputForm } from './components/price-input-form'
import { PricingResults } from './components/pricing-results'
import { extractProductData, fetchAnalysis } from './services/ollama-client'
import type { AIPricingAnalysis } from './services/ollama-client'
import { lookupTariffRate } from './services/hts-client'
import './App.css'

const LOADING_MESSAGES: Record<string, string> = {
  extracting:  'Extracting product details...',
  classifying: 'Classifying product...',
  analyzing:   'Running pricing analysis...',
}

function App() {
  const [analysis, setAnalysis] = useState<AIPricingAnalysis | null>(null)
  const [loadingPhase, setLoadingPhase] = useState<'extracting' | 'classifying' | 'analyzing' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(message: string) {
    setLoadingPhase('extracting')
    setError(null)
    setAnalysis(null)
    try {
      const extracted = await extractProductData(message)
      setLoadingPhase('classifying')
      const tariff = await lookupTariffRate(extracted.product, extracted.category, extracted.origin_country)
      setLoadingPhase('analyzing')
      const analysisPayload = await fetchAnalysis(extracted, tariff ?? undefined)
      setAnalysis({
        product: extracted.product,
        category: extracted.category,
        origin_country: extracted.origin_country,
        quantity: extracted.quantity,
        target_retailer: extracted.target_retailer,
        ...analysisPayload,
      })
    } catch (err) {
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
              ? <p className="results-placeholder">{LOADING_MESSAGES[loadingPhase]}</p>
              : <PricingResults analysis={analysis} />
            }
          </div>
        </div>
      </main>
    </>
  )
}

export default App
