# HTS Tariff Lookup

## Goal

Insert a real HTS duty-rate lookup between extraction (Call 1) and analysis (Call 2) so the pricing model receives a concrete tariff percentage instead of guessing; fall back silently to model assumption if the lookup fails.

---

## Context

Current flow: `extractProductData` → `fetchAnalysis` (model estimates tariff)  
New flow: `extractProductData` → `lookupTariffRate` → `fetchAnalysis` (receives real rate or null)

The lookup produces a `TariffResult` — a rate, the HTS code it came from, and the source. `buildAnalysisPrompt` receives this and either pins the rate ("Use exactly X%") or falls back to the existing model-estimation path. App.tsx gains a third visible loading phase between the two Ollama calls.

---

## Files to Create / Modify

| Path | Action | What changes |
|------|--------|--------------|
| `src/services/hts-client.ts` | **Create** | `HTS_CATEGORY_MAP`, `COUNTRY_RULES`, `TariffResult` type, `buildHtsUrl`, `parseHtsResponse`, `lookupTariffRate` |
| `src/services/hts-client.test.ts` | **Create** | ~16 test cases covering all exported functions |
| `src/services/ollama-client.ts` | **Modify** | `buildAnalysisPrompt` accepts optional `tariff?: TariffResult`; branches prompt text when tariff is provided. `fetchAnalysis` signature gains optional `tariff` param. |
| `src/services/ollama-client.test.ts` | **Modify** | 3 new cases: `buildAnalysisPrompt` without tariff, with tariff, and `fetchAnalysis` passing tariff through |
| `src/App.tsx` | **Modify** | Add `'fetching-tariff'` loading phase; call `lookupTariffRate` between extraction and analysis; pass result to `fetchAnalysis` |

---

## Data Types

```ts
// src/services/hts-client.ts

export interface TariffResult {
  hts_code: string     // e.g. "6912.00"
  base_rate: number    // MFN duty percentage from USITC API, e.g. 6
  surcharge: number    // country-specific add-on, e.g. 25
  total_rate: number   // base_rate + surcharge
  source: 'hts_api'   // only ever set when API call succeeded
}
```

`lookupTariffRate` returns `TariffResult | null`. `null` → caller falls back to model assumption.

---

## API Details

**Endpoint:** `https://hts.usitc.gov/reststop/api/details/getrecord?htsno={code}`  
Returns a JSON array; the first element's `general` field holds the MFN duty rate string (e.g. `"6%"`, `"Free"`, `"6.5¢/kg + 2%"`).

**Category → HTS code map** (one representative 8-digit code per category):

| Category | HTS Code | Description |
|----------|----------|-------------|
| `clothing` | `6109.10` | T-shirts, knitted cotton |
| `food` | `2106.90` | Food preparations NES |
| `electronics` | `8471.30` | Portable ADP machines |
| `home_goods` | `6912.00` | Ceramic tableware |
| `other` | *(none)* | → return `null` (model guesses) |

**Country rules table:**

| Country | Treatment | Effect on `total_rate` |
|---------|-----------|------------------------|
| China | Section 301 List 3 surcharge | `base_rate + 25` |
| Vietnam | Additional surcharge (trade action) | `base_rate + 20` |
| Mexico | USMCA preferential | `0` (overrides base entirely) |
| Canada | USMCA preferential | `0` (overrides base entirely) |
| *(all others)* | MFN only | `base_rate + 0` |

USMCA logic: if origin is Mexico or Canada, skip the USITC fetch entirely — return `TariffResult` with `base_rate: 0`, `surcharge: 0`, `total_rate: 0`, `hts_code` from the category map, `source: 'hts_api'`.

---

## `buildAnalysisPrompt` Change

**Without tariff (current behavior, unchanged):**
```
1. Estimate the HTS tariff rate for this product category and origin country...
   State the assumed HTS code and rate explicitly in tariff_rate_assumed and in assumptions[].
```

**With tariff (new branch when `tariff` is non-null):**
```
1. The duty rate for this product has been pre-fetched from the USITC HTS database:
   HTS {hts_code} — total rate {total_rate}% ({base_rate}% MFN + {surcharge}% surcharge).
   Use this exact rate. Set tariff_rate_assumed to "{total_rate}% — HTS {hts_code} (USITC)".
   Do NOT estimate or override this value.
   Add to assumptions[]: "Tariff rate sourced from USITC HTS API: {hts_code} at {total_rate}%"
```

`fetchAnalysis(extracted, tariff?)` passes the tariff through to `buildAnalysisPrompt`.

---

## Test Cases

### `hts-client.test.ts` (~16 cases)

**`buildHtsUrl`**
1. Returns correct USITC URL for a given HTS code
2. Trims whitespace from the code before embedding in URL

**`parseHtsResponse`**
3. Parses `"6%"` → `6`
4. Parses `"Free"` → `0`
5. Parses `"6.5%"` → `6.5`
6. Returns `null` for a compound rate string it cannot parse (e.g. `"6.5¢/kg + 2%"`)
7. Returns `null` when `general` field is missing or empty string
8. Returns `null` when the response array is empty

**`lookupTariffRate`**
9. Returns `null` when category is `"other"` (no HTS code mapped)
10. Returns `null` when `origin_country` is `null`
11. Returns `TariffResult` with correct `base_rate`, `surcharge`, `total_rate`, `source: 'hts_api'` for a standard MFN country
12. Applies China surcharge (+25%) on top of MFN base rate correctly
13. Applies Vietnam surcharge (+20%) on top of MFN base rate correctly
14. Returns `total_rate: 0` for Mexico (USMCA) without making a fetch call
15. Returns `null` on network failure (catches error, does not rethrow)
16. Returns `null` on non-200 response (does not throw)

### `ollama-client.test.ts` additions (3 cases)

17. `buildAnalysisPrompt` without tariff still includes "Estimate the HTS tariff rate" instruction
18. `buildAnalysisPrompt` with tariff includes "pre-fetched" and the exact rate/code; does NOT include "Estimate" instruction
19. `fetchAnalysis` passes tariff through to the prompt when provided

---

## Steps

1. **Create `hts-client.ts` stub** — export `TariffResult` type, `HTS_CATEGORY_MAP`, `COUNTRY_RULES`, empty function shells
2. **Write failing tests** — `hts-client.test.ts` with all 16 cases; run → all fail
3. **Implement `buildHtsUrl`** — run → tests 1–2 pass
4. **Implement `parseHtsResponse`** — run → tests 3–8 pass
5. **Implement `lookupTariffRate`** — run → tests 9–16 pass
6. **Write failing tests** for `buildAnalysisPrompt` and `fetchAnalysis` changes (cases 17–19); run → fail
7. **Modify `buildAnalysisPrompt`** — add optional `tariff?: TariffResult` param, branch prompt text; update `fetchAnalysis` signature
8. **Run** → tests 17–19 pass; all existing ollama-client tests still pass
9. **Modify `App.tsx`** — add `'fetching-tariff'` to the loading phase union; call `lookupTariffRate(extracted)` between `setLoadingPhase('fetching-tariff')` and `setLoadingPhase('analyzing')`; pass result to `fetchAnalysis`
10. **Run full test suite** — `npm test`; all green
11. **Lint** — `npm run lint`; clean
12. **Commit** — `feat: real HTS tariff lookup between extraction and analysis`

---

## Loading Phases (App.tsx)

Three visible phases in sequence:

| Phase | Message shown |
|-------|--------------|
| `'extracting'` | `"Extracting product details..."` |
| `'fetching-tariff'` | `"Fetching tariff rates..."` |
| `'analyzing'` | `"Running pricing analysis..."` |

`disabled` on the form remains `loadingPhase !== null`.

---

## Out of Scope

- HTS code classification beyond the 5 fixed categories
- Anti-dumping / countervailing duties (AD/CVD)
- India, Bangladesh, or any country not listed in the country rules table
- FTA rates beyond USMCA (EU, CAFTA, etc.)
- Caching tariff rates between sessions
- Validating HTS codes against an authoritative list
- Any changes to `pricing-results.tsx`, its tests, or its CSS
- Any changes to the extraction prompt or `ExtractedProduct` shape

---

## Decisions Recorded

| Question | Answer |
|----------|--------|
| HTS codes per category | One representative 8-digit code per category is acceptable |
| Country surcharge table | China +25%, Vietnam +20%, Mexico/Canada USMCA → 0%, all others MFN only |
| Loading phase | Option B — visible `'fetching-tariff'` phase ("Fetching tariff rates...") |
