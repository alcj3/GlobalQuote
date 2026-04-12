# Groq HTS Classification

## Goal

Add Groq (llama-3.3-70b-versatile) as a dedicated HTS classification step between Ollama extraction and Ollama analysis, replacing the hardcoded category-to-code map with a real product classification call whose output is then validated against the live USITC `getrecord` endpoint.

---

## Context

Current flow:
```
extractProductData → lookupTariffRate(category, country) [HTS_CATEGORY_MAP + USITC getrecord] → fetchAnalysis
```

New flow:
```
extractProductData → classifyHTS(product, category) [Groq] → lookupTariffRate(hts_code, country) [USITC getrecord] → fetchAnalysis
```

Loading phases: `'extracting'` → `'classifying'` → `'fetching-tariff'` → `'analyzing'`

**What stays the same:**
- `TariffResult` type
- `buildHtsUrl` + `parseHtsResponse` (USITC getrecord fetch — still used for rate lookup)
- `COUNTRY_SURCHARGES` + USMCA logic
- `HTS_CATEGORY_MAP` — kept as fallback when Groq fails
- `buildAnalysisPrompt` tariff injection, `retailer-config.ts`, `pricing-results.tsx`

---

## Files to Create / Modify

| Path | Action | What changes |
|------|--------|--------------|
| `src/services/groq-client.ts` | **Create** | `HTSClassification` type, `buildGroqRequest`, `parseGroqResponse`, `classifyHTS` |
| `src/services/groq-client.test.ts` | **Create** | ~11 test cases |
| `src/services/hts-client.ts` | **Modify** | `lookupTariffRate` signature: `(category, country)` → `(product, category, country)`. Internally calls `classifyHTS` first; falls back to `HTS_CATEGORY_MAP[category]` if null. USMCA path: runs `classifyHTS` to get real HTS code, overrides rate to 0. |
| `src/services/hts-client.test.ts` | **Modify** | Update `lookupTariffRate` tests for new signature; add cases for Groq fallback and USMCA real code. |
| `src/App.tsx` | **Modify** | Rename `'fetching-tariff'` → `'classifying'`; update message to `'Classifying product...'`; update `lookupTariffRate` call to `(extracted.product, extracted.category, extracted.origin_country)`. No new imports. |
| `.env.example` | **Create** | `VITE_GROQ_API_KEY=your_groq_api_key_here` |

---

## Data Types

```ts
// src/services/groq-client.ts

export interface HTSClassification {
  hts_code: string     // 8-digit HTS number, e.g. "6912.00.10"
  description: string  // brief product description from the model
}
```

---

## API Details

**Groq endpoint:** `POST https://api.groq.com/openai/v1/chat/completions`  
**Auth:** `Authorization: Bearer ${import.meta.env.VITE_GROQ_API_KEY}`  
**Model:** `llama-3.3-70b-versatile`

**Request body:**
```json
{
  "model": "llama-3.3-70b-versatile",
  "messages": [
    {
      "role": "system",
      "content": "You are a U.S. HTS tariff classification expert. Given a product name and category, return the most specific applicable 8-digit HTS code.\n\nReturn ONLY this JSON, no prose, no markdown:\n{\"hts_code\": \"<8-digit code>\", \"description\": \"<brief product description>\"}"
    },
    {
      "role": "user",
      "content": "Product: {product}\nCategory: {category}"
    }
  ],
  "temperature": 0,
  "response_format": { "type": "json_object" }
}
```

**Response shape (OpenAI-compatible):**
```json
{
  "choices": [
    {
      "message": {
        "content": "{\"hts_code\": \"6912.00.10\", \"description\": \"Ceramic tableware\"}"
      }
    }
  ]
}
```

`parseGroqResponse` reads `choices[0].message.content`, parses it as JSON, validates `hts_code` matches `/^\d{4}\.\d{2}/` (at minimum a 6-digit HTS format), and returns `HTSClassification | null`.

---

## Updated `lookupTariffRate` Logic

```
lookupTariffRate(product, category, origin_country):
  if origin_country is null → return null

  // Step 1: get HTS code (Groq with category-map fallback)
  groqResult = await classifyHTS(product, category)
  hts_code = groqResult?.hts_code ?? HTS_CATEGORY_MAP[category] ?? null
  if hts_code is null → return null

  // Step 2: USMCA fast-path — real code, zero rate
  if USMCA country:
    return { hts_code, base_rate: 0, surcharge: 0, total_rate: 0, source: 'hts_api' }

  // Step 3: fetch base rate from USITC getrecord
  base_rate = await fetchHtsRate(hts_code)   // existing buildHtsUrl + parseHtsResponse
  if base_rate is null → return null

  // Step 4: apply surcharge
  surcharge = COUNTRY_SURCHARGES[origin_country] ?? 0
  return { hts_code, base_rate, surcharge, total_rate: base_rate + surcharge, source: 'hts_api' }
```

---

## Updated App.tsx Flow

`lookupTariffRate` owns the Groq call internally — App.tsx does not import or call `classifyHTS`. The `'fetching-tariff'` phase is renamed to `'classifying'`, covering the combined Groq + USITC step. Three phases total (same count as before):

```ts
const LOADING_MESSAGES = {
  extracting:  'Extracting product details...',
  classifying: 'Classifying product...',
  analyzing:   'Running pricing analysis...',
}

type LoadingPhase = 'extracting' | 'classifying' | 'analyzing' | null

// in handleSubmit:
setLoadingPhase('extracting')
const extracted = await extractProductData(message)

setLoadingPhase('classifying')
const tariff = await lookupTariffRate(extracted.product, extracted.category, extracted.origin_country)

setLoadingPhase('analyzing')
const analysisPayload = await fetchAnalysis(extracted, tariff ?? undefined)
```

`lookupTariffRate` signature change: `(category, origin_country)` → `(product, category, origin_country)`.

---

## Test Cases

### `groq-client.test.ts` (~11 cases)

**`buildGroqRequest`**
1. Includes the product name in the user message
2. Includes the category in the user message
3. Uses model `llama-3.3-70b-versatile`
4. Sets `temperature: 0` and `response_format.type: "json_object"`

**`parseGroqResponse`**
5. Returns `HTSClassification` from a valid OpenAI-format response
6. Returns `null` when `choices` array is empty
7. Returns `null` when `content` is not valid JSON
8. Returns `null` when `hts_code` is missing from the parsed content
9. Returns `null` when `hts_code` does not match the minimum HTS format (`/^\d{4}\.\d{2}/`)

**`classifyHTS`**
10. Calls the Groq endpoint with the correct URL and `Authorization: Bearer` header
11. Returns `null` on network failure (does not throw)
12. Returns `null` on non-200 response

### `hts-client.test.ts` changes

**Update existing `lookupTariffRate` tests** — new signature `(product, category, country)`:
- All existing tests pass `'Ceramic Mug'` as first arg, `'home_goods'` as second, same country as before
- Mock `classifyHTS` to return a fixed `HTSClassification` so USITC mock still controls rate

**New cases:**
13. Falls back to `HTS_CATEGORY_MAP` when `classifyHTS` returns `null`
14. Returns USMCA result with a real `hts_code` from Groq (not `'USMCA'`) and `total_rate: 0`

---

## Steps

1. **Create `.env.example`** — `VITE_GROQ_API_KEY=your_groq_api_key_here`
2. **Create `groq-client.ts` stub** — export `HTSClassification`, empty `buildGroqRequest`, `parseGroqResponse`, `classifyHTS`
3. **Write failing tests** — `groq-client.test.ts` with all 12 cases; run → all fail
4. **Implement `buildGroqRequest`** — run → tests 1–4 pass
5. **Implement `parseGroqResponse`** — run → tests 5–9 pass
6. **Implement `classifyHTS`** — run → tests 10–12 pass
7. **Update `hts-client.test.ts`** — add `classifyHTS` mock to existing tests, add cases 13–14; run → cases 13–14 fail, existing cases still pass
8. **Update `lookupTariffRate`** in `hts-client.ts` — new signature, Groq call with category-map fallback, USMCA gets real code; run → all hts-client tests pass
9. **Update `App.tsx`** — add `'classifying'` phase, call `classifyHTS` explicitly then pass result to `lookupTariffRate`; update `lookupTariffRate` call site
10. **Run full test suite** — `npm test`; all green
11. **Lint** — `npm run lint`; clean
12. **Commit** — `feat: Groq HTS classification between extraction and tariff lookup`

---

## Out of Scope

- Any change to `ollama-client.ts`, `retailer-config.ts`, `pricing-results.tsx`, or CSS
- Displaying `HTSClassification.description` anywhere in the UI
- Caching Groq responses between submissions
- Streaming the Groq response
- Any change to `AIPricingAnalysis` type or `buildAnalysisPrompt`
- Error UI when Groq specifically fails (all failures fall back silently)

---

## Decisions Recorded

| Question | Answer |
|----------|--------|
| Phase ownership | `lookupTariffRate` owns both the Groq call and USITC fetch internally. App.tsx does not import `classifyHTS`. `'fetching-tariff'` renamed to `'classifying'` covering the combined step. |
| Missing API key | `classifyHTS` returns `null` immediately if `VITE_GROQ_API_KEY` is not set. Local dev falls back silently to category map. |
