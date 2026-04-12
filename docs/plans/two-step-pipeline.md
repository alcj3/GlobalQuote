# Two-Step Ollama Pipeline

## Goal

Refactor the single Ollama call into a sequential extraction → analysis pipeline so the model can handle rich natural language inputs (origin country, tariffs, quantity, target retailer) and surface its assumptions explicitly.

---

## Context

Current architecture: one call to `ollama-client.ts` that does extraction + analysis in a single prompt. The flat `AIPricingAnalysis` type drives both the service and the results component.

New architecture: two sequential calls, each with a focused prompt. Call 1 extracts structured data. Call 2 receives that structure and produces a tariff-aware pricing analysis with a nested output shape. The existing `fetchPricingAnalysis(message)` signature stays as the public API — App.tsx doesn't need to change its call site.

---

## Files to Create / Modify

| Path | Action | What changes |
|------|--------|--------------|
| `src/services/ollama-client.ts` | **Rewrite** | Replace 3 functions with 6. New types: `ExtractedProduct`, updated nested `AIPricingAnalysis`. New functions: `buildExtractionPrompt`, `parseExtractionResponse`, `extractProductData`, `buildAnalysisPrompt`, `parseAnalysisResponse`, `fetchAnalysis`. `fetchPricingAnalysis` becomes the orchestrator that calls both. Old `buildPrompt` and `parseOllamaResponse` deleted. |
| `src/services/ollama-client.test.ts` | **Rewrite** | New fixtures for both call shapes. ~22 test cases covering all 6 new functions. |
| `src/components/pricing-results.tsx` | **Modify** | Render new nested `AIPricingAnalysis`: cost breakdown table (manufacturing / shipping / tariff / additional / total), pricing section, confidence section (unchanged structure), buyer perspective section (unchanged structure), new assumptions section. |
| `src/components/pricing-results.test.tsx` | **Modify** | New `AIPricingAnalysis` fixture (nested shape). New test cases for cost breakdown rows, tariff rate display, assumptions list. |
| `src/components/pricing-results.css` | **Modify** | Add `.results-row-tariff` highlight style. Add `.assumptions` section styles (reuse existing pattern from buyer-insights). |
| `src/App.tsx` | **Modify** | Replace `loading` boolean + "Analyzing your product..." with two-phase loading state: `'extracting' | 'analyzing' | null`. Show "Extracting product details..." on phase 1, "Running pricing analysis..." on phase 2. Calls the two step functions directly instead of the orchestrator to get phase updates. |

---

## Data Types

```ts
// src/services/ollama-client.ts

export interface ExtractedProduct {
  product: string
  category: string                    // inferred if not stated
  origin_country: string | null
  manufacturing_cost_per_unit: number
  shipping_cost_per_unit: number      // model calculates per-unit from total if needed
  quantity: number | null
  target_retailer: string | null
  additional_costs_per_unit: number | null
  error: string | null                // non-null means extraction failed
}

export interface AIPricingAnalysis {
  // echoed from extraction for display
  product: string
  category: string
  origin_country: string | null
  quantity: number | null
  target_retailer: string | null
  // from analysis call
  landed_cost_breakdown: {
    manufacturing: number
    shipping: number
    tariff_rate_assumed: string        // e.g. "25% — Vietnam ceramics HTS 6912.00"
    tariff_cost: number
    additional: number
    total: number
  }
  pricing: {
    msrp: number
    wholesale_price: number
    supplier_margin: number
    retail_margin: number
  }
  confidence: {
    score: number
    label: 'Strong' | 'Good' | 'Risky' | 'Weak'
    explanation: string
  }
  buyer_perspective: {
    decision: string
    insights: string[]
    action: string
  }
  assumptions: string[]
}
```

---

## Call 1 — Extraction Prompt

`buildExtractionPrompt(message: string): string`

```
You are a data extraction assistant. Extract structured product and cost information from the supplier's message.

Supplier message: "{message}"

Rules:
- shipping_cost_per_unit: if a total shipping cost and quantity are given, divide them (e.g. $300/1000 units = 0.30)
- category: infer from context — must be one of: clothing, food, electronics, home_goods, other
- If you cannot identify a product name AND at least one cost, set error to:
  "Please describe your product and its costs, e.g. I sell hoodies, cost $6, shipping $2"
  and set all other fields to null/0
- Otherwise set error to null

Return ONLY this JSON, no prose, no markdown:
{
  "product": <string>,
  "category": <string>,
  "origin_country": <string or null>,
  "manufacturing_cost_per_unit": <number>,
  "shipping_cost_per_unit": <number>,
  "quantity": <number or null>,
  "target_retailer": <string or null>,
  "additional_costs_per_unit": <number or null>,
  "error": <string or null>
}
```

`parseExtractionResponse(raw: string): ExtractedProduct`
— Parses Ollama envelope, inner JSON. If `error` is a non-null string, throws immediately with that message. Validates `product` and `manufacturing_cost_per_unit` are present. Returns `ExtractedProduct`.

---

## Call 2 — Analysis Prompt

`buildAnalysisPrompt(extracted: ExtractedProduct): string`

```
You are a U.S. import pricing analyst with expertise in HTS tariff classification.

Extracted product data:
- Product: {product}
- Category: {category}
- Origin country: {origin_country ?? "unknown"}
- Manufacturing cost/unit: ${manufacturing_cost_per_unit}
- Shipping cost/unit: ${shipping_cost_per_unit}
- Additional costs/unit: ${additional_costs_per_unit ?? 0}
- Target retailer: {target_retailer ?? "generic U.S. retailer"}

Instructions:
1. Estimate the HTS tariff rate for this product category and origin country.
   - Account for Section 301 tariffs (China), Vietnam surcharges, and any other known country-specific duties.
   - State the assumed HTS code and rate explicitly in tariff_rate_assumed and in assumptions[].
2. Calculate landed cost = manufacturing + shipping + tariff + additional.
3. Generate MSRP and wholesale price for the U.S. market.
4. Calculate supplier margin (wholesale - landed_cost) / wholesale and retail margin (msrp - wholesale) / msrp.
5. Score confidence 0-100. Penalise for unknown origin, high tariff uncertainty, or thin margins.
6. Tailor the buyer perspective to {target_retailer} if provided; otherwise write for a generic U.S. buyer.
7. List every assumption made in the assumptions array (tariff rate, missing costs, inferred values).

Return ONLY this JSON, no prose, no markdown:
{
  "landed_cost_breakdown": {
    "manufacturing": <number>,
    "shipping": <number>,
    "tariff_rate_assumed": <string — e.g. "25% — Vietnam clothing HTS 6101.20">,
    "tariff_cost": <number>,
    "additional": <number>,
    "total": <number>
  },
  "pricing": {
    "msrp": <number>,
    "wholesale_price": <number>,
    "supplier_margin": <number — percentage>,
    "retail_margin": <number — percentage>
  },
  "confidence": {
    "score": <integer 0-100>,
    "label": <"Strong" | "Good" | "Risky" | "Weak">,
    "explanation": <string>
  },
  "buyer_perspective": {
    "decision": <string>,
    "insights": <array of strings>,
    "action": <string>
  },
  "assumptions": <array of strings>
}
```

`parseAnalysisResponse(raw: string): Omit<AIPricingAnalysis, 'product' | 'category' | 'origin_country' | 'quantity' | 'target_retailer'>`
— Parses Ollama envelope, inner JSON. Validates top-level keys (`landed_cost_breakdown`, `pricing`, `confidence`, `buyer_perspective`, `assumptions`) and spot-checks critical nested fields (`landed_cost_breakdown.total`, `pricing.msrp`, `confidence.score`). Throws "Invalid response: missing required field" if any fail.

---

## Orchestrator and App Integration

`fetchPricingAnalysis` is split: App.tsx now calls `extractProductData` and `fetchAnalysis` directly for phase-aware loading. The orchestrator is kept for tests.

```ts
// App.tsx — two-phase loading
const [loadingPhase, setLoadingPhase] = useState<'extracting' | 'analyzing' | null>(null)

async function handleSubmit(message: string) {
  setLoadingPhase('extracting')
  setError(null)
  setAnalysis(null)
  try {
    const extracted = await extractProductData(message)
    setLoadingPhase('analyzing')
    const result = await fetchAnalysis(extracted)
    setAnalysis(result)
  } catch (err) {
    setError(err instanceof Error ? err.message : 'An unexpected error occurred')
  } finally {
    setLoadingPhase(null)
  }
}
```

Loading display:
- `'extracting'` → `"Extracting product details..."`
- `'analyzing'` → `"Running pricing analysis..."`
- `null` → render `<PricingResults>`

`disabled` on the form is `loadingPhase !== null`.

---

## Test Cases

### `ollama-client.test.ts` (full rewrite — ~22 cases)

**`buildExtractionPrompt`**
1. Includes the user message
2. Includes all 9 required field names in the schema

**`parseExtractionResponse`**
3. Returns complete `ExtractedProduct` from valid response
4. Throws the error string when `error` field is non-null
5. Throws "Invalid response" when inner response is not valid JSON
6. Throws when `product` or `manufacturing_cost_per_unit` is missing

**`extractProductData`**
7. Calls fetch POST to Ollama with model/stream/format
8. Returns `ExtractedProduct` on success
9. Throws "Could not reach Ollama" on network failure
10. Throws HTTP status on non-200

**`buildAnalysisPrompt`**
11. Includes extracted product name and manufacturing cost
12. Includes origin_country when present
13. Includes target_retailer when present
14. Uses fallback text when origin_country is null
15. Uses "generic U.S. retailer" when target_retailer is null

**`parseAnalysisResponse`**
16. Returns complete nested analysis object from valid response
17. Throws "Invalid response" when inner response is not valid JSON
18. Throws when top-level section (`pricing`, `confidence`, etc.) is missing
19. Throws when critical nested field (`pricing.msrp`, `landed_cost_breakdown.total`) is missing

**`fetchPricingAnalysis`** (orchestrator — tests the two-call sequence)
20. Makes exactly two fetch calls in sequence
21. Returns `AIPricingAnalysis` merging extraction fields + analysis fields
22. Throws extraction error without making the second call when extraction fails

### `pricing-results.test.tsx` (update fixture + add cases)
23. Renders landed cost breakdown section with manufacturing, shipping, tariff, additional, total rows
24. Renders `tariff_rate_assumed` string as text
25. Renders assumptions section with each assumption as a list item
26. Renders placeholder when analysis is null *(unchanged)*
27. Renders confidence score and label *(update fixture, logic unchanged)*
28. Renders buyer perspective decision, insights, action *(update fixture, logic unchanged)*

---

## Steps

1. **Write failing tests** — full rewrite of `ollama-client.test.ts` with new fixtures and all 22 cases; run `npm test` → all new tests fail, `pricing-results` tests still pass
2. **Rewrite** `src/services/ollama-client.ts` — all 6 functions + new types; run → ollama-client tests pass
3. **Write failing tests** — update `pricing-results.test.tsx` fixture + add cases 23–25; run → new cases fail
4. **Modify** `src/components/pricing-results.tsx` — render nested shape + assumptions; run → all pricing-results tests pass
5. **Modify** `src/components/pricing-results.css` — tariff row highlight, assumptions section styles
6. **Modify** `src/App.tsx` — two-phase loading state, call `extractProductData` + `fetchAnalysis` directly
7. **Run full test suite** — `npm test`; all tests green
8. **Lint** — `npm run lint`; clean
9. **Commit** — `feat: two-step extraction + analysis pipeline with tariff support`

---

## Out of Scope

- Persisting extraction results between sessions
- Caching tariff rates or HTS lookups
- Validating HTS codes against an authoritative database
- Multi-currency support (all costs remain USD)
- Streaming responses from either Ollama call
- Any changes to the form or App.css

---

## Decisions Recorded

| Question | Answer |
|----------|--------|
| Orchestrator vs. callbacks | App.tsx calls `extractProductData` + `fetchAnalysis` directly — simpler to read |
| `error: null` behaviour | `null` = success, non-null string = throw immediately, skip Call 2 |
| Display quantity and target_retailer | Yes — add to the Details section in `pricing-results.tsx` |
