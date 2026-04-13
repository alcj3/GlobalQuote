# Plan: Remove USITC exportList fetch — tariff rate from category map only

## Goal

Replace the broken (CORS-blocked) USITC exportList fetch and Groq HTS classification in `hts-client.ts` with a direct lookup of `general_rate` from `hts-category-map.json`, and remove the diagnostic `console.log` statements added this session.

---

## Files to create/modify

| File | Change |
|------|--------|
| `src/services/hts-client.ts` | Remove `classifyHTS` import, `HTS_EXPORT_BASE`, `buildExportUrl`, `parseExportResponse`, console.logs; change `HTS_CATEGORY_MAP` to store full entry (`hts_code` + `general_rate`); add internal `parseRateString` helper; rewrite `lookupTariffRate` to be map-only; remove `product` param; rename `TariffResult.source` from `'hts_api'` to `'category_map'` |
| `src/services/hts-client.test.ts` | Remove `buildExportUrl` test block (3 tests); remove `parseExportResponse` test block (8 tests); remove Groq mock boilerplate; rewrite `lookupTariffRate` block (11 tests → 8 new map-based tests); no fetch mocking needed |
| `src/App.tsx` | Remove `extracted.product` from the `lookupTariffRate` call: `(extracted.product, extracted.category, …)` → `(extracted.category, …)` |

---

## Test cases (TDD — write these first, confirm they fail)

All new tests go in `src/services/hts-client.test.ts` inside a rewritten `lookupTariffRate` describe block. The old block is deleted entirely.

1. `returns null when origin_country is null` — `lookupTariffRate('home_goods', null)` → null
2. `returns null when category has no map entry` — `lookupTariffRate('unmapped_category', 'Japan')` → null
3. `returns TariffResult with correct base_rate, hts_code, and source for MFN country` — `lookupTariffRate('home_goods', 'Japan')` → `{ hts_code: '6912.00', base_rate: 10, surcharge: 0, total_rate: 10, source: 'category_map' }`
4. `applies China surcharge (+25%) on top of map rate` — `lookupTariffRate('home_goods', 'China')` → `{ base_rate: 10, surcharge: 25, total_rate: 35 }`
5. `applies Vietnam surcharge (+20%) on top of map rate` — `lookupTariffRate('home_goods', 'Vietnam')` → `{ base_rate: 10, surcharge: 20, total_rate: 30 }`
6. `returns total_rate: 0 for USMCA country (Mexico) without calling fetch` — `lookupTariffRate('clothing', 'Mexico')` → `{ base_rate: 0, surcharge: 0, total_rate: 0, source: 'category_map' }`
7. `returns total_rate: 0 for USMCA country (Canada)` — same as above for 'Canada'
8. `handles "Free" general_rate from map (electronics)` — `lookupTariffRate('electronics', 'Japan')` → `{ base_rate: 0, surcharge: 0, total_rate: 0 }`

---

## Steps

1. **Delete** the `buildExportUrl` describe block and `parseExportResponse` describe block from `hts-client.test.ts`. Delete the Groq `vi.mock` import and `classifyHTS` import. Delete the `mockUsitcFetch` helper and `beforeEach` Groq setup inside `lookupTariffRate` block. Delete all existing `lookupTariffRate` test cases.
2. **Write** the 8 new failing `lookupTariffRate` test cases listed above (new signature: `lookupTariffRate(category, origin_country)`).
3. **Run** `npm test -- --run` — confirm 8 tests fail (and all import errors from the deleted functions surface — that's expected).
4. **Rewrite `hts-client.ts`**:
   - Remove `import { classifyHTS } from './groq-client'`
   - Remove `HTS_EXPORT_BASE` constant
   - Remove `buildExportUrl` function
   - Remove `parseExportResponse` function
   - Change `HTS_CATEGORY_MAP` to store `{ hts_code, general_rate }` per entry: `Record<string, { hts_code: string; general_rate: string }>`
   - Add unexported `parseRateString(rate: string): number | null` — parses `"10%"` → `10`, `"Free"` → `0`, anything else → `null`
   - Change `TariffResult.source` literal from `'hts_api'` to `'category_map'`
   - Rewrite `lookupTariffRate(category: string, origin_country: string | null): Promise<TariffResult | null>`:
     - Return null if `origin_country === null`
     - Look up `HTS_CATEGORY_MAP[category]` — return null if not found
     - USMCA fast-path: return `{ hts_code, base_rate: 0, surcharge: 0, total_rate: 0, source: 'category_map' }`
     - `base_rate = parseRateString(entry.general_rate)` — return null if null
     - `surcharge = COUNTRY_SURCHARGES[origin_country] ?? 0`
     - Return `{ hts_code, base_rate, surcharge, total_rate: base_rate + surcharge, source: 'category_map' }`
   - Remove all three `console.log` lines
5. **Run** tests — confirm all 8 new tests pass; confirm the old 11 USITC tests are gone.
6. **Update `App.tsx` line 27**: `lookupTariffRate(extracted.product, extracted.category, extracted.origin_country)` → `lookupTariffRate(extracted.category, extracted.origin_country)`.
7. **Run full test suite** — all tests pass.
8. **Run lint** — clean.

---

## Out of scope

- No changes to `groq-client.ts` or `groq-client.test.ts` — the Groq client stays in the codebase, just no longer called by `hts-client.ts`.
- No changes to `ollama-client.ts` — `TariffResult` is imported as a type only; the `source` rename doesn't affect any prompt logic (the field is not referenced in prompt strings).
- No changes to `hts-category-map.json` — `general_rate` values are already present and correct.
- No changes to `pricing-results.tsx` or any other UI component.
- No changes to the `COUNTRY_SURCHARGES` map or `USMCA_COUNTRIES` set — both stay.
- The `'classifying'` loading phase label in `App.tsx` stays — it's still accurate (we're resolving an HTS category, just via map now).

---

## Open questions

None — scope is clear. Ready to implement on approval.
