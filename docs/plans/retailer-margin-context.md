# Retailer Margin Context

## Goal

Inject hardcoded retailer-specific margin expectations into the analysis prompt so the model evaluates pricing viability against concrete targets instead of guessing what a given retailer expects.

---

## Context

Current state: `buildAnalysisPrompt` tells the model to "tailor the buyer_perspective to {target_retailer}" but gives it no concrete margin expectations. The model guesses what Walmart or Costco actually expects, with varying accuracy.

New state: a `RETAILER_MARGINS` table maps known retailer names to `(min_margin, max_margin)` pairs. `buildAnalysisPrompt` resolves the target retailer to a margin range (falling back to a generic default) and includes it as an additional instruction block. The model then evaluates whether `retail_margin` falls within that range and surfaces the result in `buyer_perspective.insights` and the confidence score.

No new loading phase, no network call — this is a pure synchronous data enrichment of the existing prompt.

---

## Retailer Margin Table

| Retailer | Expected retail margin range |
|----------|------------------------------|
| Walmart | 25–30% |
| Target | 40–50% |
| Costco | 14–15% |
| Whole Foods | 35–40% |
| Generic (default) | 35–45% |

Matching is **case-insensitive, exact name** (e.g. `"walmart"` → Walmart). The generic default applies when `target_retailer` is `null` or does not match any known entry.

---

## Files to Create / Modify

| Path | Action | What changes |
|------|--------|--------------|
| `src/services/retailer-config.ts` | **Create** | `RetailerMargins` type, `RETAILER_MARGINS` map, `getRetailerMargins(name)` lookup function |
| `src/services/retailer-config.test.ts` | **Create** | ~8 test cases for `getRetailerMargins` |
| `src/services/ollama-client.ts` | **Modify** | `buildAnalysisPrompt` imports `getRetailerMargins`, resolves margins from `extracted.target_retailer`, adds a retailer margin instruction block to the prompt |
| `src/services/ollama-client.test.ts` | **Modify** | 3 new cases for the margin instruction in the prompt |

No changes to `App.tsx`, `pricing-results.tsx`, CSS, or the `AIPricingAnalysis` type — the model already returns `buyer_perspective.insights` as an array of strings, so richer insight content requires no structural change.

---

## Data Types

```ts
// src/services/retailer-config.ts

export interface RetailerMargins {
  name: string        // display name, e.g. "Walmart"
  min_margin: number  // e.g. 25
  max_margin: number  // e.g. 30
}
```

`getRetailerMargins(retailer: string | null): RetailerMargins`  
— Always returns a value. Returns the generic default when `retailer` is `null` or not found.

---

## `buildAnalysisPrompt` Change

`buildAnalysisPrompt` resolves margins internally: `getRetailerMargins(extracted.target_retailer)`. No change to its external signature — existing callers and tests are unaffected.

New instruction block inserted before instruction 6 (buyer_perspective):

```
Retailer margin context:
- ${margins.name} expects a retail margin of ${margins.min_margin}–${margins.max_margin}%.
- Evaluate whether the suggested retail_margin falls within, above, or below this range.
- In buyer_perspective.insights, include one insight explicitly stating whether the margin is on-target, too thin, or too wide for ${margins.name}.
- If retail_margin is more than 5 percentage points outside this range, penalise the confidence score.
```

---

## Test Cases

### `retailer-config.test.ts` (~8 cases)

**`getRetailerMargins`**
1. Returns Walmart margins (25–30%) for `"Walmart"`
2. Returns Target margins (40–50%) for `"Target"`
3. Returns Costco margins (14–15%) for `"Costco"`
4. Returns Whole Foods margins (35–40%) for `"Whole Foods"`
5. Returns generic default (35–45%) for `null`
6. Returns generic default for an unknown retailer string
7. Match is case-insensitive: `"walmart"` returns Walmart margins
8. Match is case-insensitive: `"WHOLE FOODS"` returns Whole Foods margins

### `ollama-client.test.ts` additions (~3 cases)

9. `buildAnalysisPrompt` with a known retailer (`validExtraction`, `target_retailer: "Walmart"`) includes the Walmart margin range `"25–30%"` in the prompt
10. `buildAnalysisPrompt` with `target_retailer: null` includes the generic default range `"35–45%"` in the prompt
11. `buildAnalysisPrompt` includes the instruction to penalise confidence when margin is outside the range

---

## Steps

1. **Create `retailer-config.ts` stub** — export `RetailerMargins` type, `RETAILER_MARGINS` map (5 entries), empty `getRetailerMargins` shell
2. **Write failing tests** — `retailer-config.test.ts` with all 8 cases; run → all fail
3. **Implement `getRetailerMargins`** — run → tests 1–8 pass
4. **Write failing tests** for `buildAnalysisPrompt` additions (cases 9–11); run → fail
5. **Modify `buildAnalysisPrompt`** — import `getRetailerMargins`, resolve margins, add retailer margin instruction block
6. **Run** → tests 9–11 pass; all 5 existing `buildAnalysisPrompt` tests still pass
7. **Run full test suite** — `npm test`; all green
8. **Lint** — `npm run lint`; clean
9. **Commit** — `feat: retailer margin context in analysis prompt`

---

## Out of Scope

- Dynamic retailer data (no API or database lookup)
- Adding more than the 4 named retailers + generic default
- Rendering retailer margin range in `pricing-results.tsx`
- Any change to `AIPricingAnalysis` type shape
- Any change to `App.tsx` or loading phases
- Any change to the extraction prompt or `ExtractedProduct`
- Partial/fuzzy name matching (e.g. "Whole Foods Market" → Whole Foods) — exact case-insensitive only

---

## Open Questions

| # | Question | Options |
|---|----------|---------|
| 1 | Matching strategy: exact case-insensitive only, or also substring (e.g. "Whole Foods Market")? | Exact-only (simpler, predictable) / Substring (more forgiving for user input variations) |
| 2 | Should the generic default margin range (35–45%) also be applied when a retailer is specified but not in the table, or should the prompt in that case use no margin context and let the model guess? | Default for all unknowns / No injection for unrecognized retailers |
