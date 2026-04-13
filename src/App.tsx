import { useState, useEffect } from 'react'
import { PriceInputForm } from './components/price-input-form'
import { PricingResults } from './components/pricing-results'
import { extractProductData, fetchAnalysis, warmOllama } from './services/ollama-client'
import type { AIPricingAnalysis } from './services/ollama-client'
import { lookupTariffRate } from './services/hts-client'
import './App.css'

const LOADING_MESSAGES: Record<string, string> = {
  extracting: 'Extracting product details...',
  analyzing:  'Running pricing analysis...',
}

function App() {
  const [analysis, setAnalysis] = useState<AIPricingAnalysis | null>(null)
  const [loadingPhase, setLoadingPhase] = useState<'extracting' | 'analyzing' | null>(null)
  const [slowWarning, setSlowWarning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void warmOllama() }, [])

  useEffect(() => {
    if (loadingPhase === null) {
      setSlowWarning(false)
      return
    }
    const timer = setTimeout(() => setSlowWarning(true), 15_000)
    return () => clearTimeout(timer)
  }, [loadingPhase])

  async function handleSubmit(message: string) {
    setLoadingPhase('extracting')
    setError(null)

    const hardTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Analysis timed out. Please try again.')), 90_000)
    )

    async function runPipeline(): Promise<AIPricingAnalysis> {
      const extracted = await extractProductData(message)
      const tariff = await lookupTariffRate(extracted.category, extracted.origin_country)
      setLoadingPhase('analyzing')
      const analysisPayload = await fetchAnalysis(extracted, tariff ?? undefined)
      return {
        product: extracted.product,
        category: extracted.category,
        origin_country: extracted.origin_country,
        quantity: extracted.quantity,
        target_retailer: extracted.target_retailer,
        ...analysisPayload,
      }
    }

    try {
      const result = await Promise.race([runPipeline(), hardTimeout])
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
              ? (
                <p className="results-placeholder">
                  {slowWarning ? 'Analysis is taking longer than expected...' : LOADING_MESSAGES[loadingPhase]}
                </p>
              )
              : <PricingResults analysis={analysis} />
            }
          </div>
        </div>
      </main>
    </>
  )
}

export default App
