# Plan: Mug demo fixes — Groq HTS misclassification, MSRP floor, buyer decision field

## Goal

Fix three bugs that make the ceramic mug demo unreliable: Groq classifying mugs as 6906 (pipes) instead of 6912 (tableware), the margin-derived MSRP being too low for cheap home goods, and `buyer_perspective.decision` sometimes rendering blank.

---

## Files to create/modify

| File | Change |
|------|--------|
| `src/services/groq-client.ts` | Add one-sentence negative example to the system prompt: "Ceramic mugs, bowls, and tableware are HTS 6912, NOT 6906 (which is ceramic pipes and conduits for construction)." |
| `src/services/groq-client.test.ts` | Add test: `buildGroqRequest` system prompt contains "6912" and "NOT 6906". |
| `src/services/ollama-client.ts` | Extend step 3 of `buildAnalysisPrompt` with a category-aware MSRP floor: for `home_goods` / `home_ceramics`, if the formula-derived MSRP is below $7, scale up `wholesale_price` so that `msrp` is at least $8. |
| `src/services/ollama-client.test.ts` | Add test: `buildAnalysisPrompt` with `category: 'home_goods'` contains the $7/$8 floor instruction and the `home_ceramics` category name. Add test: with `category: 'clothing'`, the floor instruction is absent. Add test: `buildAnalysisPrompt` step 7 instructs `buyer_perspective.decision` to be non-empty, with an example string. |
| `src/components/pricing-results.tsx` | Add `|| '—'` fallback: `<dd>{buyer_perspective.decision \|\| '—'}</dd>` |
| `src/components/pricing-results.test.tsx` | Add test: renders `—` in the Buyer Decision row when `decision` is an empty string. |

---

## Test cases (TDD — write these first, confirm they fail)

### groq-client.test.ts

1. `buildGroqRequest system prompt includes "6912"` — asserts the system prompt string contains `6912`.
2. `buildGroqRequest system prompt includes "NOT 6906"` — asserts the system prompt string contains `NOT 6906`.

### ollama-client.test.ts

3. `buildAnalysisPrompt — MSRP floor present for home_goods` — with `category: 'home_goods'`, prompt contains `$7` (the check threshold) and `$8` (the floor).
4. `buildAnalysisPrompt — MSRP floor present for home_ceramics` — with `category: 'home_ceramics'`, prompt contains `home_ceramics` and the floor values.
5. `buildAnalysisPrompt — MSRP floor absent for clothing` — with `category: 'clothing'`, prompt does NOT contain the floor instruction text (e.g. does not contain `"below $7"`).
6. `buildAnalysisPrompt — decision field must be non-empty` — prompt contains `buyer_perspective.decision must be a non-empty string`.

### pricing-results.test.tsx

7. `PricingResults renders "—" for Buyer Decision when decision is empty string` — renders the component with `buyer_perspective.decision: ''` and asserts the text `—` appears in the Buyer Decision row.

---

## Steps

1. **Read** `src/services/groq-client.test.ts` and `src/services/groq-client.ts` (already done).
2. **Write failing tests** for items 1–2 in `groq-client.test.ts`.
3. **Run** `npm test -- --run` — confirm new tests fail.
4. **Fix** `groq-client.ts`: append the negative example sentence to the system prompt `content` string.
5. **Run** tests — confirm items 1–2 pass, all others still pass.
6. **Write failing tests** for items 3–6 in `ollama-client.test.ts`.
7. **Run** tests — confirm new tests fail.
8. **Fix** `ollama-client.ts` `buildAnalysisPrompt`: after the existing step 3 formula block, add a conditional paragraph. If `extracted.category` is `'home_goods'` or `'home_ceramics'`, append:
   ```
   Price floor for home goods / ceramics: U.S. retail reality for ceramic mugs/bowls is $8–15.
   If the formula produces an MSRP below $7, scale up wholesale_price so that msrp is at least $8.
   Use msrp = 8, then back-calculate: wholesale_price = msrp * (1 - retail_margin / 100).
   ```
   Also add to step 7: `"buyer_perspective.decision must be a non-empty string, e.g. 'Proceed with negotiation' or 'Strong buy at current terms'."`.
9. **Run** tests — confirm items 3–6 pass, all others still pass.
10. **Write failing test** for item 7 in `pricing-results.test.tsx`.
11. **Run** tests — confirm new test fails.
12. **Fix** `pricing-results.tsx`: change `<dd>{buyer_perspective.decision}</dd>` to `<dd>{buyer_perspective.decision || '—'}</dd>`.
13. **Run full test suite** — all 103 + new tests pass.
14. **Run lint** — clean.

---

## Out of scope

- No changes to `hts-category-map.json` (both `home_goods` and `home_ceramics` already correctly map to `6912.00`).
- No changes to the extraction prompt or `ExtractedProduct` type.
- No changes to `retailer-config.ts`.
- No UI visual changes beyond the `|| '—'` fallback.
- No changes to the USITC 8-digit code issue (separate backlog item).
- No new country surcharges.

---

## Open questions

None — all three fixes are well-scoped. Ready to implement on approval.
