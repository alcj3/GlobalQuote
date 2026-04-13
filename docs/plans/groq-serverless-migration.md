# Groq Serverless Migration + Vercel Deployment

## Goal

Replace the two Ollama LLM calls (`extractProductData`, `fetchAnalysis`) with a single Vercel serverless function at `POST /api/analyze` that calls Groq server-side, then deploy to Vercel with the landing page at `/` and the React app at `/app`.

---

## Architecture

```
Browser → POST /api/analyze → Vercel function → Groq API (llama-3.3-70b-versatile)
                                              → hts-client.ts (sync, no external call)
                ← AIPricingAnalysis ←────────────────────────────────────────────────
```

- `VITE_GROQ_API_KEY` is set in Vercel dashboard. The serverless function reads it as `process.env.VITE_GROQ_API_KEY` — it never appears in the browser bundle.
- The React app makes one call to `/api/analyze` per submission and gets back the complete result.
- All prompt logic, parsing, and tariff lookup move to the server. The client thins to a wrapper around one fetch call.

---

## Files to create/modify

| File | What changes |
|------|-------------|
| `package.json` | Add `@vercel/node` to devDependencies (types only — needed for `VercelRequest`/`VercelResponse` in the serverless function) |
| `api/analyze.ts` | **NEW** — Vercel serverless function. Receives `{message}`, calls Groq twice (extract → analyze), looks up tariff via `hts-client`, returns `AIPricingAnalysis` |
| `api/analyze.test.ts` | **NEW** — unit tests for the pure functions exported from the serverless handler (prompt builders, response parsers, full pipeline with mocked fetch) |
| `src/services/ollama-client.ts` | Stripped to types + one function: `fetchPricingAnalysis(message)` calls `POST /api/analyze`. All prompt/parse functions and `warmOllama` deleted. |
| `src/services/ollama-client.test.ts` | Replace all Ollama-specific tests with tests for the new `fetchPricingAnalysis` API call (mocked fetch to `/api/analyze`) |
| `src/App.tsx` | Import `fetchPricingAnalysis` only. Remove `warmOllama` effect, `lookupTariffRate` import, `slowWarning` state. Simplify `loadingPhase` to `'analyzing' \| null`. |
| `vercel.json` | Add `buildCommand`, `outputDirectory`, rewrites: `/` → landing, `/app` → React app |
| `.env.example` | **NEW** — documents `VITE_GROQ_API_KEY` |

---

## Serverless function design (`api/analyze.ts`)

### Request / Response

```
POST /api/analyze
Content-Type: application/json
{ "message": "I sell hoodies from Vietnam, mfg $6, shipping $2, 1000 units, Target" }

200 OK  → { ...AIPricingAnalysis }
400     → { "error": "message is required" }
500     → { "error": "Pricing service unavailable. Please try again." }
```

### Internal pipeline

1. Call Groq with extraction chat messages → parse into `ExtractedProduct`
2. Call `lookupTariffRate(category, origin_country)` (synchronous, local)
3. Call Groq with analysis chat messages (includes tariff data) → parse into analysis payload
4. Return assembled `AIPricingAnalysis` object

### Groq format adaptation

Ollama used a single `prompt` string. Groq uses OpenAI chat format:
- Extraction: `system` = role + output schema, `user` = supplier message
- Analysis: `system` = analyst role + output schema, `user` = extracted product data as JSON

With `response_format: { type: 'json_object' }`, Groq returns the JSON string directly in `choices[0].message.content` — no outer `{ response: "..." }` wrapper to unwrap.

The existing prompt content in `ollama-client.ts` (both `buildExtractionPrompt` and `buildAnalysisPrompt`) is preserved verbatim, just restructured into system/user split.

### Exported pure functions (testable without the HTTP handler)

```ts
export function buildExtractionMessages(message: string): ChatMessage[]
export function parseGroqExtraction(content: string): ExtractedProduct
export function buildAnalysisMessages(extracted: ExtractedProduct, tariff?: TariffResult): ChatMessage[]
export function parseGroqAnalysis(content: string): AnalysisPayload
```

These are pure functions — the handler calls them in sequence and they can be unit-tested in isolation.

---

## Test cases (write these first — must fail before implementation)

### `api/analyze.test.ts` (new)

```
buildExtractionMessages
  it('includes the user message in the user role message')
  it('includes all 9 required field names in system content')
  it('instructs shipping_cost_per_unit to null when not determinable')

parseGroqExtraction
  it('parses valid Groq JSON content into ExtractedProduct')
  it('throws when error field is non-null')
  it('throws "Invalid response" when content is not valid JSON')
  it('returns shipping_cost_per_unit: null when field is absent')

buildAnalysisMessages
  it('includes the tariff rate in the system message when tariff is provided')
  it('includes the retailer margin context in the system message')
  it('includes all required output fields in the schema')
  it('includes the clothing MSRP floor instruction for clothing category')
  it('includes the home_goods MSRP floor instruction for home_goods category')
  it('sets tariff_cost = manufacturing * (rate/100) instruction')

parseGroqAnalysis
  it('parses valid Groq JSON content into analysis payload')
  it('throws when a required top-level section is missing')
  it('throws when landed_cost_breakdown.total is missing')
  it('throws when pricing.msrp is missing')
```

### `src/services/ollama-client.test.ts` (replace existing)

```
fetchPricingAnalysis
  it('calls POST /api/analyze with the message in the body')
  it('returns AIPricingAnalysis on success')
  it('throws "Pricing service unavailable" when fetch throws')
  it('throws "Pricing service unavailable" on non-OK HTTP response')
  it('throws the error string when response JSON contains { error: string }')
```

**All existing Ollama tests are deleted** — they test behavior that moves to the server.

---

## Implementation steps

1. **Add `@vercel/node`** to devDependencies:
   ```bash
   npm install --save-dev @vercel/node
   ```

2. **Write failing tests** in `api/analyze.test.ts` (all tests listed above for `buildExtractionMessages`, `parseGroqExtraction`, `buildAnalysisMessages`, `parseGroqAnalysis`). Run `npm test` — confirm they fail (file doesn't exist).

3. **Write failing tests** for the new `fetchPricingAnalysis` in `ollama-client.test.ts`. Run `npm test` — confirm they fail.

4. **Create `api/analyze.ts`**:
   - Export pure functions: `buildExtractionMessages`, `parseGroqExtraction`, `buildAnalysisMessages`, `parseGroqAnalysis`
   - Export default handler calling them in sequence with Groq fetch
   - Import `lookupTariffRate` from `../src/services/hts-client`
   - Import `getRetailerMargins` from `../src/services/retailer-config`
   - Read API key from `process.env.VITE_GROQ_API_KEY`
   - Run `npm test` — confirm `api/analyze.test.ts` tests pass

5. **Rewrite `src/services/ollama-client.ts`**:
   - Keep all type exports (`ExtractedProduct`, `AIPricingAnalysis`, etc.)
   - Replace `extractProductData`, `fetchAnalysis`, `warmOllama`, and all prompt/parse functions with a single `fetchPricingAnalysis(message)` that calls `POST /api/analyze`
   - `fetchPricingAnalysis` throws `"Pricing service unavailable..."` on network error or non-OK response; re-throws the `error` field from the JSON on application errors
   - Run `npm test` — confirm `ollama-client.test.ts` tests pass

6. **Update `src/App.tsx`**:
   - Replace imports: `extractProductData`, `fetchAnalysis`, `warmOllama`, `lookupTariffRate` → just `fetchPricingAnalysis`
   - Remove `warmOllama` `useEffect`
   - Remove `slowWarning` state and its `useEffect`
   - Simplify `loadingPhase` type to `'analyzing' | null`
   - Simplify `LOADING_MESSAGES` to just `{ analyzing: 'Running pricing analysis...' }`
   - Simplify `handleSubmit` to: `setLoadingPhase('analyzing')` → `fetchPricingAnalysis(message)` → `setAnalysis(result)`
   - Keep the 90s hard timeout
   - Run `npm test` — 105 total tests should still pass (net: same count since we're replacing, not adding)

7. **Run `npm run lint`** — fix any issues.

8. **Create `vercel.json`**:
   ```json
   {
     "buildCommand": "npm run build",
     "outputDirectory": "dist",
     "rewrites": [
       { "source": "/app", "destination": "/index.html" },
       { "source": "/",    "destination": "/landing/index.html" }
     ]
   }
   ```

9. **Create `.env.example`**:
   ```
   # Groq API key — get one at console.groq.com
   VITE_GROQ_API_KEY=
   ```

10. **Push to GitHub**:
    ```bash
    git push origin main
    ```

11. **Deploy on Vercel**:
    - vercel.com → New Project → Import `alcj3/GlobalQuote`
    - Add environment variable: `VITE_GROQ_API_KEY` = the key from `.env`
    - Deploy
    - Verify: `/` serves landing page, `/app` serves the React app, submit a hoodie query and confirm analysis returns

---

## Local dev note

`npm run dev` (Vite) still works for UI development. Calls to `/api/analyze` will 404 in pure Vite mode since Vite doesn't run the serverless function. To run the full stack locally:
```bash
npx vercel dev
```
This starts both the Vite frontend and the serverless functions. For testing, `npm test` mocks the `/api/analyze` fetch call so no server is needed.

---

## Out of scope

- Groq model tuning or prompt changes beyond the format adaptation
- Removing `groq-client.ts` (dead code — leave for now, separate cleanup)
- Streaming responses from Groq
- Auth / rate limiting on the `/api/analyze` endpoint
- Custom domain setup (Vercel dashboard only)
- USMCA / China tariff rate accuracy (existing limitation, separate plan)

---

## Resolved

- **URL structure**: Landing at `/`, app at `/app`
- **API key env var name**: `VITE_GROQ_API_KEY` (matches `.env`, set in Vercel dashboard)
- **Model**: `llama-3.3-70b-versatile` (same as existing `groq-client.ts`)
