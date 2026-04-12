# Free-Text Product Input

## Goal

Replace the structured multi-field form with a single free-text textarea so users describe their product in natural language; Ollama extracts the product name, category, and costs from that message, and returns an error when it cannot.

---

## Context

The previous "input validation" plan added a guard for implausible structured inputs but never changed the input model — the form still sends discrete typed fields to Ollama. The phrase "from the user message" in the original request implied free-text input where Ollama does the extraction. This plan makes that change.

**Currently on disk but uncommitted:** `ollama-client.ts` already has the `{"error": "..."}` detection in `parseOllamaResponse`. That logic is correct and carries forward; it just needs its function signature updated (the `inputs` echo is removed).

---

## Files to Create / Modify / Delete

| Path | Action | What changes |
|------|--------|--------------|
| `src/types.ts` | **Delete** | `CostInputs` and `Category` are no longer needed once the form sends a plain string. File would be empty — delete it. |
| `src/services/ollama-client.ts` | **Modify** | (1) `buildPrompt` accepts `message: string` instead of `CostInputs` and instructs Ollama to extract product name, category, and costs from free text, returning `{"error": "..."}` if extraction fails. (2) `productName` and `category` move into `REQUIRED_FIELDS` — Ollama now returns them, they are no longer echoed from inputs. (3) `parseOllamaResponse(raw, inputs)` → `parseOllamaResponse(raw)` — no more inputs echo. (4) `fetchPricingAnalysis(inputs: CostInputs)` → `fetchPricingAnalysis(message: string)`. |
| `src/services/ollama-client.test.ts` | **Modify** | Update all call sites to the new signatures. `buildPrompt` tests pass a string. `parseOllamaResponse` tests drop the `inputs` arg. `fetchPricingAnalysis` tests pass a string. Add test: `parseOllamaResponse` returns `productName` and `category` from the parsed response (not from a separate input). |
| `src/components/price-input-form.tsx` | **Modify** | Strip all structured fields (product name input, category select, three number inputs, `CostInputs` import). Replace with a single `<textarea>` labelled "Describe your product". `onSubmit` callback changes from `(inputs: CostInputs) => void` to `(message: string) => void`. Client-side validation: only check that the textarea is non-empty. Keep `disabled` prop — button still shows "Analyzing..." when loading. |
| `src/components/price-input-form.test.tsx` | **Rewrite** | Drop all old structured-field tests. New cases: renders textarea, empty submit blocked with error, valid submit calls onSubmit with the string, disabled prop disables button. |
| `src/components/price-input-form.css` | **Modify** | Remove `.form-cost-group`, `.form-cost-group-title` blocks (unused). Add `.form-textarea` style. Keep `.form-field`, `.form-label`, `.form-error`, `.form-submit`. |
| `src/App.tsx` | **Modify** | `handleSubmit` signature: `(message: string)` instead of `(inputs: CostInputs)`. Remove `CostInputs` import. |

---

## Data Type Changes

`CostInputs` and `Category` are deleted. `AIPricingAnalysis` in `ollama-client.ts` gains `productName` and `category` in `REQUIRED_FIELDS`:

```ts
// Before: productName/category echoed from inputs, not validated
const REQUIRED_FIELDS = ['landed_cost', 'msrp', ...]

// After: Ollama must return them
const REQUIRED_FIELDS = ['productName', 'category', 'landed_cost', 'msrp', ...]
```

`AIPricingAnalysis` interface itself does not change shape — `productName: string` and `category: string` are already declared on it.

---

## New Prompt Design

`buildPrompt(message: string): string`:

```
You are a U.S. market pricing analyst. A supplier has described their product in natural language.

Your job:
1. Extract the product name, category, and any costs (manufacturing, shipping, additional) from their message.
2. If you cannot identify a clear product name AND at least one cost, return ONLY this JSON and nothing else:
   {"error": "Please describe your product and its costs, e.g. I sell hoodies, cost $6, shipping $2"}
3. Otherwise, generate a full pricing analysis.

Supplier message: "{message}"

Category must be one of: clothing, food, electronics, home_goods, other — infer from context.
If a cost is not mentioned, assume $0 and note it in your analysis.

Return ONLY a JSON object with these exact fields (no explanation, no markdown):
{
  "productName": <string — product name you extracted>,
  "category": <string — one of the five categories>,
  "landed_cost": <number — sum of all costs you extracted>,
  "msrp": ...,
  "wholesale_price": ...,
  "supplier_margin": ...,
  "retail_margin": ...,
  "confidence_score": ...,
  "confidence_label": ...,
  "confidence_explanation": ...,
  "buyer_decision": ...,
  "buyer_insights": ...,
  "buyer_action": ...
}
```

---

## Test Cases

### `price-input-form.test.tsx` (full rewrite — 4 cases)

1. Renders a textarea and a submit button
2. Submitting with an empty textarea does not call `onSubmit` and shows a validation error
3. Submitting with a non-empty message calls `onSubmit` with the raw string value
4. Disabled prop disables the submit button

### `ollama-client.test.ts` (update existing + 1 new)

**`buildPrompt`** (update existing 3, signatures change):
5. Prompt contains the user message string
6. Prompt includes the `{"error": "..."}` fallback instruction
7. *(existing "additionalCosts is 0" test is deleted — no longer relevant)*

**`parseOllamaResponse`** (drop `inputs` arg from all calls):
8. Returns `AIPricingAnalysis` including `productName` and `category` from the parsed response (not from a separate input — new test)
9. Throws with Ollama error message when response contains `{"error": "..."}`  *(existing, keep)*
10. Throws on error field even when other fields present *(existing, keep)*
11. Throws "Invalid response" when response is not valid JSON *(existing, keep)*
12. Throws on missing required fields *(existing, keep — now covers productName/category too)*

**`fetchPricingAnalysis`** (update `inputs` → `message: string`):
13. Calls fetch POST with correct URL and body shape *(existing, update)*
14. Returns AIPricingAnalysis on success *(existing, update)*
15. Rejects with Ollama error message on validation error *(existing, keep)*
16. Throws "Could not reach Ollama" on network failure *(existing, keep)*
17. Throws HTTP status on non-200 *(existing, keep)*

---

## Steps

1. **Delete** `src/types.ts`
2. **Write failing tests** — rewrite `price-input-form.test.tsx` (4 cases); update `ollama-client.test.ts` signatures + add case 8; run `npm test` → new/updated tests fail, unchanged tests pass
3. **Modify** `src/components/price-input-form.tsx` — single textarea, string `onSubmit`; run → form tests pass
4. **Modify** `src/components/price-input-form.css` — remove cost-group rules, add textarea style
5. **Modify** `src/services/ollama-client.ts` — new `buildPrompt`, updated `parseOllamaResponse`, updated `fetchPricingAnalysis`; add `productName`/`category` to REQUIRED_FIELDS; run → all ollama-client tests pass
6. **Modify** `src/App.tsx` — `handleSubmit(message: string)`, remove `CostInputs` import
7. **Run full test suite** — `npm test`; all tests green
8. **Lint** — `npm run lint`; clean
9. **Commit** — `feat: replace structured form with free-text input`

---

## Out of Scope

- Keeping the category dropdown as a hint alongside the textarea
- Multi-product / batch input
- Persisting or re-displaying the user's original message after submission
- Retry UI when Ollama returns a validation error
- Any changes to `pricing-results.tsx`, `pricing-results.css`, or `App.css`

---

## Decisions Recorded

| Question | Answer |
|----------|--------|
| Placeholder text | `"e.g. I sell hoodies, manufacturing cost $6, shipping $2"` |
| Label text | `"Describe your product"` |
| Commit sequencing | One commit covering everything |
