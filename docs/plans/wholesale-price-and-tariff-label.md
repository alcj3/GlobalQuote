# Wholesale Price and Tariff Label Fixes

## Goal

Fix two prompt-level bugs in `buildAnalysisPrompt`: (1) the model sets `wholesale_price = landed_cost` giving 0% supplier margin, and (2) the API-sourced tariff label omits the origin country making it internally inconsistent with the input data shown.

## Files to modify

- **`src/services/ollama-client.ts`**
  - Step 3 of `buildAnalysisPrompt`: replace "Generate MSRP and wholesale price" with explicit margin-first formulas so the model derives prices from target margins instead of guessing
  - Tariff label in `tariffInstruction`: add `origin_country` and rate breakdown to the `tariff_rate_assumed` string (one-line change)

- **`src/services/ollama-client.test.ts`**
  - Add tests for the new step 3 formula language
  - Add test for the tariff label including origin country

## Test cases

1. `buildAnalysisPrompt` includes the formula `landed_cost / (1 - supplier_margin/100)` for wholesale
2. `buildAnalysisPrompt` includes the formula `wholesale_price / (1 - retail_margin/100)` for msrp
3. `buildAnalysisPrompt` includes an explicit warning against setting wholesale_price ≤ landed_cost
4. When a tariff is provided, `buildAnalysisPrompt` includes the origin country in the tariff_rate_assumed string

## Changes

### Bug 1 — step 3 rewrite

Old:
```
3. Generate MSRP and wholesale price for the U.S. market.
```

New:
```
3. Derive wholesale_price and msrp from target margins — NEVER set wholesale_price equal to or less than landed_cost:
   - Choose supplier_margin between 25% and 45%
   - wholesale_price = landed_cost / (1 - supplier_margin / 100)
   - Choose retail_margin to meet the retailer's expected range (see step 6)
   - msrp = wholesale_price / (1 - retail_margin / 100)
```

### Bug 2 — tariff label one-liner

Old (line 157):
```ts
Set tariff_rate_assumed to "${tariff.total_rate}% — HTS ${tariff.hts_code} (USITC)".
```

New:
```ts
Set tariff_rate_assumed to "${tariff.total_rate}% — HTS ${tariff.hts_code} (${extracted.origin_country ?? 'origin'}: ${tariff.base_rate}% MFN + ${tariff.surcharge}% surcharge, USITC)".
```

## Out of scope

- No changes to `hts-client.ts`, `groq-client.ts`, `retailer-config.ts`, or any component
- No changes to `AIPricingAnalysis` or `TariffResult` types
- No Playwright test changes
