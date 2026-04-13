# Plan: Prompt fixes — clothing MSRP floor, margin direction wording, tariff duty base

## Goal

Tighten three analysis prompt instructions in `ollama-client.ts` so the model applies a $20 MSRP floor for clothing, states margin direction in unambiguous terms, and calculates tariff cost on manufacturing cost only (not shipping).

---

## Files to create/modify

| File | What changes |
|------|-------------|
| `src/services/ollama-client.ts` | (Fix 1) Extend `msrpFloorInstruction` condition to include `'clothing'`; add clothing-specific floor text at $20. (Fix 2) Replace vague margin direction language in `retailerInstruction` with explicit too-thin / too-wide / on-target logic. (Fix 3) Extend `tariffInstruction` (both branches) and step 2 to spell out `tariff_cost = manufacturing_cost_per_unit × (total_rate / 100)` with an explicit note that shipping is excluded from the duty base. |
| `src/services/ollama-client.test.ts` | (Fix 1) Delete the existing `'does not include the price floor instruction for clothing'` test; add two new tests: floor present for `clothing`, floor absent for `food`. (Fix 2) Replace the existing `'penalise'` test with a more specific assertion; add one test for the explicit margin-direction language. (Fix 3) Add two tests: one asserts the tariff-base formula appears in the prompt when a tariff is provided; one asserts it appears in the no-tariff (estimate) branch too. |

---

## Test cases

All changes go in `src/services/ollama-client.test.ts`.

### Fix 1 — clothing MSRP floor

**Delete:**
```
it('does not include the price floor instruction for clothing') — line 394–397
```
This test was written when clothing had no floor. It becomes wrong by design.

**Add (in the `buildAnalysisPrompt — MSRP price floor` describe block):**
```
it('includes $19/$20 floor instruction for clothing category')
  — buildAnalysisPrompt({ ...validExtraction, category: 'clothing' })
  — prompt contains '$19' (check threshold) and '$20' (floor)

it('does not include the price floor instruction for food')
  — buildAnalysisPrompt({ ...validExtraction, category: 'food' })
  — prompt does not contain 'below $19' and does not contain 'below $7'
```

### Fix 2 — explicit margin direction wording

**Replace** the existing `'includes the instruction to penalise confidence when margin is outside the range'` test with a tighter assertion (the `penalise` word is still there, so the old test would still pass — but add a new test for the explicit three-way logic):

**Add (in the `buildAnalysisPrompt — retailer margin context` describe block):**
```
it('includes explicit too-thin / on-target / too-wide direction logic in buyer_perspective instruction')
  — buildAnalysisPrompt(validExtraction)
  — prompt contains 'too thin'
  — prompt contains 'too wide'
  — prompt contains 'on-target'
```

### Fix 3 — tariff duty base

**Add (new `buildAnalysisPrompt — tariff duty base` describe block):**
```
it('includes tariff_cost formula using manufacturing cost only, when tariff is provided')
  — buildAnalysisPrompt(validExtraction, tariff)    // tariff fixture from existing describe block
  — prompt contains 'manufacturing_cost_per_unit'
  — prompt contains 'total_rate / 100'
  — prompt contains 'Shipping is not included in the duty base'

it('includes tariff_cost formula in the estimate branch (no tariff provided)')
  — buildAnalysisPrompt(validExtraction)
  — prompt contains 'manufacturing_cost_per_unit'
  — prompt contains 'total_rate / 100'
  — prompt contains 'Shipping is not included in the duty base'
```

---

## Steps

### Fix 1 — clothing MSRP floor

1. In `ollama-client.test.ts`, delete the `'does not include the price floor instruction for clothing'` test (lines 394–397). Add the two new tests described above.
2. Run `npm test -- --run` — new tests fail (floor not yet present for clothing), food test passes.
3. In `ollama-client.ts`, update `msrpFloorInstruction`:
   ```typescript
   const msrpFloorInstruction =
     (extracted.category === 'home_goods' || extracted.category === 'home_ceramics')
       ? `\n   Price floor for home_goods / home_ceramics: U.S. retail reality for ceramic mugs and bowls is $8–15.
      If the formula produces an msrp below $7, scale up wholesale_price so that msrp is at least $8.
      Use msrp = 8, then back-calculate: wholesale_price = msrp * (1 - retail_margin / 100).`
     : extracted.category === 'clothing'
       ? `\n   Price floor for clothing: U.S. retail reality for imported apparel is $20–60.
      If the formula produces an msrp below $19, scale up wholesale_price so that msrp is at least $20.
      Use msrp = 20, then back-calculate: wholesale_price = msrp * (1 - retail_margin / 100).`
     : ''
   ```
4. Run `npm test -- --run` — all tests pass.

### Fix 2 — explicit margin direction wording

5. In `ollama-client.test.ts`, add the `'too thin / on-target / too wide'` test described above.
6. Run `npm test -- --run` — new test fails.
7. In `ollama-client.ts`, update `retailerInstruction`. Replace:
   ```
   - In buyer_perspective.insights, include one insight explicitly stating whether the margin is on-target, too thin, or too wide for ${margins.name}.
   ```
   with:
   ```
   - In buyer_perspective.insights, include one insight about the retail_margin direction for ${margins.name}: if retail_margin is below ${margins.min_margin}%, state it is too thin; if above ${margins.max_margin}%, state it is too wide; if between ${margins.min_margin}% and ${margins.max_margin}%, state it is on-target.
   ```
8. Run `npm test -- --run` — all tests pass.

### Fix 3 — tariff duty base

9. In `ollama-client.test.ts`, add the two tariff-base tests in a new describe block.
10. Run `npm test -- --run` — both new tests fail.
11. In `ollama-client.ts`, append to step 2 of the prompt (the landed cost instruction):
    ```
    2. Calculate landed cost = manufacturing + shipping + tariff + additional.
       tariff_cost = manufacturing_cost_per_unit × (total_rate / 100).
       Shipping is not included in the duty base.${shippingAssumptionInstruction}
    ```
    This wording is identical in both the tariff-provided and estimate branches since the formula lives in the shared step 2 paragraph, not inside `tariffInstruction`.
12. Run `npm test -- --run` — all tests pass.
13. Run `npm run lint` — clean.

### Verification

14. Print `buildAnalysisPrompt` output for the Vietnam hoodie → Target scenario and eyeball the three changed sections:
    - Floor instruction block contains `$19`/`$20` and references `clothing`
    - Retailer instruction contains `too thin`, `too wide`, `on-target` with the Target min/max numbers interpolated
    - Step 2 contains `manufacturing_cost_per_unit × (total_rate / 100)` and `Shipping is not included in the duty base`

    Do this with a one-off `npx tsx` script or via a focused Vitest test that logs the prompt — whichever is faster.

---

## Out of scope

- No changes to `home_goods` or `home_ceramics` floor values ($7 check / $8 floor) — those stay as-is
- No changes to `food`, `electronics`, or `other` categories — no floors added
- No changes to `retailer-config.ts` margin ranges
- No changes to `hts-category-map.json`, `hts-client.ts`, or any component
- No changes to `parseAnalysisResponse` or `AIPricingAnalysis` types
- No prompt changes to the extraction call (`buildExtractionPrompt`)
- No changes to the confidence score or label logic (already removed from UI)

---

## Open questions

1. **Clothing floor check threshold** — the plan uses `$19` as the check threshold (i.e. "if msrp below $19, set to $20"), matching the pattern used for home_goods ($7 check → $8 floor). Is $19/$20 the right pair, or do you want a different threshold, e.g. $18/$20?

2. **Tariff base formula notation** — the prompt currently uses `×` (multiplication sign). Should it use `*` instead for consistency with the other formulas in the prompt (which use `*` and `/`)?

3. **Scope of the margin-direction fix** — the current wording evaluates `retail_margin` against the retailer's range. The request says "supplier_margin … below the retailer's minimum target." Clarify: should the explicit direction logic apply to `supplier_margin` (supplier's take), `retail_margin` (buyer's take), or both? Right now the retailer instruction only addresses `retail_margin`; extending to `supplier_margin` would require adding a separate instruction referencing the 25–45% supplier target range.
