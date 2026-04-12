# HTS Search API

## Goal

Replace the hardcoded `HTS_CATEGORY_MAP` in `hts-client.ts` with a live keyword search against the USITC search endpoint, so the HTS code and base duty rate are derived from the actual extracted product name rather than a fixed 5-entry category table.

---

## Context

Current flow: `lookupTariffRate(category, origin_country)` maps `category` → a hardcoded HTS code → fetches the rate from the `getrecord` endpoint.

New flow: `lookupTariffRate(product, origin_country)` searches the USITC search endpoint with the product name → picks the first result with a parseable rate → applies the existing country surcharge table.

**What stays the same:**
- `TariffResult` type — unchanged
- `COUNTRY_SURCHARGES` table (China +25%, Vietnam +20%) — unchanged
- USMCA fast-path logic (Mexico/Canada → skip fetch, total_rate = 0) — unchanged
- Fallback to model assumption when the lookup returns `null` — unchanged (App.tsx already handles this)
- `buildAnalysisPrompt` tariff injection — unchanged (receives `TariffResult | null`, doesn't care how it was fetched)

**What changes:**
- `HTS_CATEGORY_MAP` removed
- `buildHtsUrl` removed (pointed at the `getrecord` endpoint, no longer needed)
- `parseHtsResponse` removed (parsed the `getrecord` response shape)
- New: `buildSearchUrl(keyword)` → USITC search endpoint
- New: `parseSearchResponse(raw)` → extracts `hts_code` + `base_rate` from search results
- `lookupTariffRate` signature: `(category, origin_country)` → `(product, origin_country)`
- App.tsx call: `lookupTariffRate(extracted.category, …)` → `lookupTariffRate(extracted.product, …)`

---

## Files to Modify

| Path | Action | What changes |
|------|--------|--------------|
| `src/services/hts-client.ts` | **Rewrite** | Remove `HTS_CATEGORY_MAP`, `buildHtsUrl`, `parseHtsResponse`. Add `buildSearchUrl`, `parseSearchResponse`. Update `lookupTariffRate` signature and body. |
| `src/services/hts-client.test.ts` | **Rewrite** | Replace `buildHtsUrl` + `parseHtsResponse` test groups with `buildSearchUrl` + `parseSearchResponse`. Update `lookupTariffRate` tests to use product string instead of category. |
| `src/App.tsx` | **Modify** | Change `lookupTariffRate(extracted.category, extracted.origin_country)` → `lookupTariffRate(extracted.product, extracted.origin_country)` |

No changes to `ollama-client.ts`, `ollama-client.test.ts`, `retailer-config.ts`, `pricing-results.tsx`, or any CSS.

---

## API Details

**Search endpoint:**
```
GET https://hts.usitc.gov/reststop/search?keyword={encoded_product_name}
```

**Assumed response shape** (see Open Question #1):
```json
[
  {
    "htsno": "6912.00.00.00",
    "description": "Ceramic or porcelain tableware...",
    "general": "6%",
    "special": "Free",
    "other": "25%"
  },
  ...
]
```

`parseSearchResponse` reads the array, finds the first element where `general` can be parsed by the existing simple-rate parser (`/^(\d+(?:\.\d+)?)%$/` or `"Free"`), and returns `{ hts_code: string, base_rate: number }`. If no parseable element exists, returns `null`.

The `hts_code` is taken from `htsno` of the matched element. The `base_rate` is the parsed `general` value.

---

## USMCA Path

When `origin_country` is Mexico or Canada, skip the search entirely and return:
```ts
{ hts_code: 'USMCA', base_rate: 0, surcharge: 0, total_rate: 0, source: 'hts_api' }
```

`hts_code: 'USMCA'` is a display string. It will appear as `tariff_rate_assumed` in the analysis output ("0% — HTS USMCA (USITC)"), which clearly signals the preferential treatment to the reader.

> **Open question #1:** The search response shape above is assumed from the USITC API patterns. The actual field names (`htsno` vs `hts_no`, array vs wrapped object) need to be confirmed. I propose we verify with one real request before implementing `parseSearchResponse`. I can do this with a quick `curl` or Playwright fetch at the start of Step 3 and adjust the parser to match the real shape.

---

## Data Types

```ts
// hts-client.ts — unchanged
export interface TariffResult {
  hts_code: string
  base_rate: number
  surcharge: number
  total_rate: number
  source: 'hts_api'
}

// new internal type, not exported
interface SearchResult {
  hts_code: string
  base_rate: number
}
```

---

## Test Cases

### `hts-client.test.ts` (full rewrite, ~16 cases)

**`buildSearchUrl`**
1. Returns the correct USITC search URL for a simple keyword
2. URL-encodes spaces and special characters in the keyword
3. Trims leading/trailing whitespace from the keyword

**`parseSearchResponse`**
4. Returns `{ hts_code, base_rate }` from the first element with a parseable `general` field
5. Parses `"Free"` → `base_rate: 0`
6. Parses `"6.5%"` → `base_rate: 6.5`
7. Skips elements with unparseable `general` (e.g. `"6.5¢/kg"`) and returns the next parseable one
8. Returns `null` when no element has a parseable `general`
9. Returns `null` when the response array is empty
10. Returns `null` when the response is not an array

**`lookupTariffRate`**
11. Returns `null` when `origin_country` is `null`
12. Returns `TariffResult` with `hts_code` from the search result and `surcharge: 0` for a standard MFN country
13. Applies China surcharge (+25%) on top of the search-derived base rate
14. Applies Vietnam surcharge (+20%) on top of the search-derived base rate
15. Returns `total_rate: 0` and `hts_code: 'USMCA'` for Mexico without making a fetch call
16. Returns `null` on network failure (does not rethrow)
17. Returns `null` on non-200 response

That's 17 cases — 3 more than the current 14, gained by adding a `buildSearchUrl` case and a `parseSearchResponse` skip-and-find case.

---

## Steps

1. **Write failing tests** — full rewrite of `hts-client.test.ts` with all 17 cases; run → all fail (functions don't exist yet)
2. **Verify search response shape** — make one real request to confirm field names (`htsno` vs other, array vs wrapper); adjust `parseSearchResponse` fixture in the test file if needed before proceeding
3. **Implement `buildSearchUrl`** — run → tests 1–3 pass
4. **Implement `parseSearchResponse`** — run → tests 4–10 pass
5. **Rewrite `lookupTariffRate`** — remove `HTS_CATEGORY_MAP` dependency, use `buildSearchUrl` + `parseSearchResponse`; run → tests 11–17 pass
6. **Update App.tsx** — swap `extracted.category` → `extracted.product` in the `lookupTariffRate` call
7. **Run full test suite** — `npm test`; all 67 existing tests still pass, new hts-client suite passes
8. **Lint** — `npm run lint`; clean
9. **Commit** — `refactor: HTS lookup via USITC keyword search, remove category map`

---

## Out of Scope

- Searching on more than the `product` field (e.g. combining product + category for a more specific query)
- Picking the "best" search result beyond the first parseable one
- Caching search results between submissions
- Any changes to `ollama-client.ts`, `retailer-config.ts`, `pricing-results.tsx`, or CSS
- Any changes to the `TariffResult` type or the surcharge table values
- Handling compound duty rates (e.g. `"6.5¢/kg + 2%"`) — these still fall back to model assumption, same as today

---

## Open Questions

| # | Question | Proposed default |
|---|----------|------------------|
| 1 | Confirm the USITC search response field names before writing `parseSearchResponse` — is the rate in `general`? Is the HTS code in `htsno`? Is the response a flat array or wrapped in a key? | Verify at start of Step 2 before implementing the parser |
| 2 | USMCA `hts_code` display value: use `"USMCA"` as a string, or run the search anyway to get a real code but override the rate to 0? | `"USMCA"` placeholder (skip search) — simpler, faster, unambiguous |
