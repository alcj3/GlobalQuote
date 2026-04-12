# Ollama Input Validation

## Goal

Instruct Ollama to validate its own inputs and return `{"error": "..."}` when it cannot produce a meaningful pricing analysis, then surface that message in the UI instead of silently hallucinating outputs.

---

## Context

The form currently does client-side validation (product name required, manufacturing cost required). That catches *structural* gaps — empty fields. But it cannot catch *semantic* gaps: a product name of `"aaa"`, a manufacturing cost of `$0.01`, or any combination that would cause the model to invent plausible-sounding but fictional numbers. The Ollama validation layer catches those at the AI level.

---

## Files to Create / Modify

| Path | Action | What changes |
|------|--------|--------------|
| `src/services/ollama-client.ts` | **Modify** | Two changes: (1) `buildPrompt` gains a validation clause at the top of the prompt telling Ollama to return `{"error": "..."}` when inputs are insufficient; (2) `parseOllamaResponse` checks for an `error` field *before* the required-fields check and throws with its value if present. |
| `src/services/ollama-client.test.ts` | **Modify** | Add 2 test cases to `parseOllamaResponse` and 1 to `fetchPricingAnalysis` covering the validation error path. |

No other files change. `App.tsx` already catches thrown errors and displays them via the error banner — the validation error will flow through that same path without any new wiring.

---

## Prompt Change

A validation clause is prepended to the existing prompt in `buildPrompt`:

```
Before generating a pricing analysis, check whether the inputs are usable:
- Product Name must be a real, identifiable product (not empty, not a placeholder like "test").
- At least one cost (Manufacturing, Shipping, or Additional) must be greater than $0.

If either check fails, return ONLY this JSON object and nothing else:
{"error": "Please describe your product and its costs, e.g. I sell hoodies, cost $6, shipping $2"}

Otherwise, continue with the full pricing analysis below.
```

The error message is hardcoded in the prompt so the output is consistent regardless of which model is used.

---

## `parseOllamaResponse` Change

Check for `error` field immediately after parsing the inner JSON, before the required-fields loop:

```ts
if (typeof inner.error === 'string') {
  throw new Error(inner.error)
}
```

This means any `{"error": "..."}` Ollama returns is re-thrown verbatim. The `catch` in `handleSubmit` (App.tsx) picks it up and calls `setError(message)`, which renders the existing error banner — no UI changes needed.

---

## Test Cases

All additions to `src/services/ollama-client.test.ts`.

### `parseOllamaResponse` (2 new cases)

1. When the response contains `{"error": "Please describe your product..."}`, throws with exactly that message (not "Invalid response", not a missing-field error)
2. When the response contains `{"error": "..."}` alongside other fields (partial response), still throws — error field takes priority over any other content

### `fetchPricingAnalysis` (1 new case)

3. When Ollama returns a validation error JSON, `fetchPricingAnalysis` rejects with the Ollama error message (end-to-end path through mock fetch)

### `buildPrompt` (1 new case)

4. The prompt includes the validation instruction text (checks for the keyword "error" alongside language about checking inputs)

---

## Steps

1. **Write 4 failing tests** in `ollama-client.test.ts` — run `npm test` → new tests fail, existing 9 pass
2. **Update `buildPrompt`** — prepend the validation clause; run `npm test` → buildPrompt test passes (3 failing remain)
3. **Update `parseOllamaResponse`** — add `error` field check before required-fields loop; run `npm test` → all 3 remaining new tests pass
4. **Run full test suite** — `npm test`; all 28 tests green
5. **Lint** — `npm run lint`; clean
6. **Commit** — `feat: add Ollama-side input validation`

---

## Out of Scope

- Changing client-side form validation — existing required-field checks stay as-is
- Adding a new free-text input field — form remains structured
- Retry logic when validation fails — user corrects and resubmits manually
- Localizing the error message — hardcoded English string only
- Any changes to `App.tsx`, `PricingResults`, CSS, or any file outside `ollama-client.ts` and its test

---

## Decisions Recorded

| Question | Answer |
|----------|--------|
| Error message ownership | Hardcoded in prompt — consistent, exact wording |
| Error display location | Existing error banner (between form and results) is fine |
| Validation threshold | Leave as model judgment call — no explicit cost floor |
