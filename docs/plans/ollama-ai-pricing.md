# Refactor: Ollama AI Pricing Analysis

## Goal

Replace the client-side deterministic pricing math with a single async call to a local Ollama instance (`llama3.2`), returning a richer AI-generated analysis including confidence scoring and buyer intelligence.

---

## Files to Create / Modify / Delete

| Path | Action | What changes |
|------|--------|--------------|
| `src/types.ts` | **Create** | Shared `Category` type and `CostInputs` interface, moved here from `pricing-engine.ts`. Single source of truth for input shape. |
| `src/services/ollama-client.ts` | **Create** | Three pure functions: `buildPrompt(inputs)`, `parseOllamaResponse(raw)`, `fetchPricingAnalysis(inputs)`. All Ollama I/O lives here. Exports `AIPricingAnalysis` type. Imports `CostInputs` from `../types`. |
| `src/services/ollama-client.test.ts` | **Create** | Vitest unit tests for all three functions (see Test Cases below). Uses `vi.stubGlobal('fetch', ...)` to mock `fetch`. |
| `src/services/pricing-engine.ts` | **Delete** | Replaced by `src/types.ts` (shared types) + `src/services/ollama-client.ts` (logic). |
| `src/services/pricing-engine.test.ts` | **Delete** | All tests targeted math functions that no longer exist. Nothing left to test. |
| `src/App.tsx` | **Modify** | `handleSubmit` becomes `async`. Add `loading: boolean` and `error: string \| null` state. Render an error banner between the form and results sections when `error` is set. Pass `disabled={loading}` to `PriceInputForm`. |
| `src/components/price-input-form.tsx` | **Modify** | Accept `disabled?: boolean` prop; pass it to the submit button so it cannot be double-submitted during loading. Update import to `../types`. |
| `src/components/price-input-form.test.tsx` | **Modify** | Update import to `../types`. Add one test: button is disabled when `disabled={true}` is passed. |
| `src/components/pricing-results.tsx` | **Modify** | Import `AIPricingAnalysis` from `../services/ollama-client`. Render new fields: landed cost, confidence score/label/explanation, buyer decision/insights/action. Remove retail price range (no longer in AI output). |
| `src/components/pricing-results.test.tsx` | **Modify** | Replace `PricingAnalysis` fixture with `AIPricingAnalysis` fixture. Update/add tests for new rendered fields. |
| `src/components/pricing-results.css` | **Modify** | Add styles for confidence badge (color-coded by label), buyer insights list, and buyer decision display. |

---

## Data Types

```ts
// src/services/ollama-client.ts

export interface AIPricingAnalysis {
  productName: string        // echoed from inputs (not from Ollama)
  category: string           // echoed from inputs
  landed_cost: number
  msrp: number
  wholesale_price: number
  supplier_margin: number    // percentage, e.g. 42.5
  retail_margin: number      // percentage
  confidence_score: number   // 0–100
  confidence_label: 'Strong' | 'Good' | 'Risky' | 'Weak'
  confidence_explanation: string
  buyer_decision: 'Strong Buy' | 'Consider with Negotiation' | 'Unlikely to Accept' | 'Reject'
  buyer_insights: string[]
  buyer_action: string
}
```

`CostInputs` and `Category` live in `src/types.ts`. Both `price-input-form.tsx` and `ollama-client.ts` import from there.

---

## Ollama API Contract

**Endpoint:** `POST http://localhost:11434/api/generate`

**Request body:**
```json
{
  "model": "llama3.2",
  "prompt": "<built prompt>",
  "stream": false,
  "format": "json"
}
```

**Response shape (Ollama non-streaming):**
```json
{ "response": "{ ...json string... }", "done": true, ... }
```

`parseOllamaResponse` extracts `response`, parses it as JSON, validates required fields are present, and returns `AIPricingAnalysis`.

---

## System Prompt Design

`buildPrompt(inputs: CostInputs): string` returns a single string passed as `prompt`. The prompt instructs the model to act as a U.S. market pricing analyst and return **only** a JSON object:

```
You are a U.S. market pricing analyst. A supplier is asking for help pricing a product.

Inputs:
- Product Name: {productName}
- Category: {category}
- Manufacturing Cost: ${manufacturingCost}
- Shipping Cost: ${shippingCost}
- Additional Costs: ${additionalCosts} (0 means none provided — make a reasonable assumption)

Return ONLY a JSON object with these exact fields (no explanation, no markdown):
{
  "landed_cost": <number — sum of all costs>,
  "msrp": <number — suggested retail price for U.S. market>,
  "wholesale_price": <number — typically ~50% of msrp>,
  "supplier_margin": <number — percentage profit for the supplier>,
  "retail_margin": <number — percentage profit for the retailer>,
  "confidence_score": <integer 0–100>,
  "confidence_label": <"Strong" | "Good" | "Risky" | "Weak">,
  "confidence_explanation": <string — 1-2 sentences explaining the score>,
  "buyer_decision": <"Strong Buy" | "Consider with Negotiation" | "Unlikely to Accept" | "Reject">,
  "buyer_insights": <array of 2–4 strings — what a U.S. buyer would think>,
  "buyer_action": <string — one actionable sentence for the supplier>
}
```

---

## Test Cases

### `src/services/ollama-client.test.ts`

**`buildPrompt`**
1. Includes product name, category, all three cost fields in the returned string
2. When `additionalCosts` is `0`, the prompt still includes the field (not silently dropped)

**`parseOllamaResponse`**
3. Returns a complete `AIPricingAnalysis`-shaped object when given a valid Ollama response JSON string
4. Throws an error containing "Invalid response" when `response` field is not valid JSON
5. Throws an error when required fields (`msrp`, `buyer_decision`, `buyer_insights`, etc.) are missing from the parsed object

**`fetchPricingAnalysis`**
6. Calls `fetch` with `POST`, URL `http://localhost:11434/api/generate`, and a body containing `model: "llama3.2"`, `stream: false`, `format: "json"`
7. Returns a parsed `AIPricingAnalysis` (with `productName` and `category` echoed from inputs) on a successful 200 response
8. Throws an error containing "Could not reach Ollama" when `fetch` rejects (network failure)
9. Throws an error containing the HTTP status when Ollama returns a non-200 response

### `src/components/price-input-form.test.tsx` (addition)
10. Submit button is disabled when `disabled={true}` prop is passed

### `src/components/pricing-results.test.tsx` (replace existing fixture + tests)
11. Renders "Landed Cost", "MSRP", "Wholesale Price" labels
12. Renders "Retail Margin" and "Supplier Margin" formatted as `XX.X%`
13. Renders confidence score as a number and confidence label as text
14. Renders confidence explanation text
15. Renders buyer decision text
16. Renders each string in `buyer_insights` as a list item
17. Renders buyer action text
18. Renders placeholder when `analysis` is `null`

---

## Steps

1. **Delete** `src/services/pricing-engine.ts` and `src/services/pricing-engine.test.ts`
2. **Create** `src/types.ts` — move `Category` and `CostInputs` here
3. **Write failing tests** in `src/services/ollama-client.test.ts` — all 9 cases above; run `npm test` → all fail
4. **Implement** `src/services/ollama-client.ts` — `buildPrompt`, `parseOllamaResponse`, `fetchPricingAnalysis`; run tests → all pass
5. **Write failing test** in `price-input-form.test.tsx` (case 10); update import to `../types`; run → fail
6. **Modify** `src/components/price-input-form.tsx` — update import to `../types`, add `disabled?: boolean` prop to button; run → pass
7. **Write failing tests** in `pricing-results.test.tsx` (cases 11–18, replacing old fixture); run → fail
8. **Modify** `src/components/pricing-results.tsx` — import `AIPricingAnalysis`, render all new fields; run → pass
9. **Modify** `src/components/pricing-results.css` — add confidence badge styles, buyer insights list styles
10. **Modify** `src/App.tsx` — async `handleSubmit`, `loading` + `error` state, error banner between form and results, `disabled={loading}` on form
11. **Run full test suite** — `npm test`; all tests green
12. **Lint** — `npm run lint`; fix any issues
13. **Commit** — `refactor: replace pricing math with Ollama AI analysis`

---

## Out of Scope

- Backend / FastAPI — all logic remains client-side
- Streaming responses from Ollama — using `stream: false` only
- Caching or persisting AI responses
- Retry logic if Ollama returns a bad response
- Multiple AI models or model selection UI
- The `retailPriceMin` / `retailPriceMax` retail range — not part of the AI output shape
- Authentication or user accounts
- PDF export or sharing

---

## Decisions Recorded

| Decision | Answer |
|----------|--------|
| `pricing-engine.ts` fate | Delete entirely; types move to `src/types.ts` |
| Error UX | Separate error banner rendered in `App.tsx` between form and results |
| Loading UX | Disabled submit button + "Analyzing..." placeholder in results area |
| Response validation | Fail loud — throw if any required field is missing |
