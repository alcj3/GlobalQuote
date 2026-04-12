# Demo Bug Fixes and Playwright E2E Test

## Goal

Fix three prompt-level bugs found during demo testing (shipping extraction, margin math consistency, buyer insight grounding) and add a Playwright end-to-end test that verifies the full pipeline with a realistic hoodie-from-Vietnam input.

## Files to create/modify

- **`src/services/ollama-client.ts`**
  - `ExtractedProduct`: change `shipping_cost_per_unit: number` → `shipping_cost_per_unit: number | null`
  - `buildExtractionPrompt`: add four few-shot examples covering bulk/per-unit shipping patterns; add explicit null instruction when shipping cannot be determined
  - `parseExtractionResponse`: line 107 — change `?? 0` to `?? null` so unknown shipping surfaces as null instead of silently defaulting to 0
  - `buildAnalysisPrompt`: handle `null` shipping in the data block (render as "unknown" and add instruction to include in assumptions); add explicit margin formulas with verify-before-return instruction (Bug 2); tell the model to reference exact calculated margin values in `buyer_perspective.insights` (Bug 3)

- **`src/services/ollama-client.test.ts`**
  - Add test cases listed below for all three bugs

- **`tests/demo.spec.ts`** *(create)*
  - Playwright end-to-end test for the demo scenario

- **`playwright.config.ts`** *(create)*
  - Playwright config: baseURL `http://localhost:5173`, `webServer` pointing at `npm run dev`, screenshot output dir

- **`tests/screenshots/`** *(create directory via test)*
  - `demo-output.png` written by the Playwright test

- **`package.json`** *(requires your approval — dependency change)*
  - Add `@playwright/test` to devDependencies

## Test cases

### Bug 1 — Shipping extraction (`buildExtractionPrompt`)
1. Prompt includes the few-shot example `'$2 shipping per unit'`
2. Prompt includes the few-shot example for `'shipping costs $300 for 1000 units'` showing the division result `0.30`
3. Prompt includes the few-shot example `'shipping is $2 each'`
4. Prompt includes the few-shot example `'I pay $500 to ship 200 units'` showing result `2.50`
5. Prompt includes instruction to set `shipping_cost_per_unit` to `null` when shipping cannot be determined

### Bug 1 — Shipping extraction (`parseExtractionResponse`)
6. Returns `shipping_cost_per_unit: null` when `shipping_cost_per_unit` is absent from the parsed JSON (no longer defaults to 0)
7. Returns `shipping_cost_per_unit: null` when `shipping_cost_per_unit` is `null` in the parsed JSON

### Bug 1 — Shipping null in analysis prompt (`buildAnalysisPrompt`)
8. When `shipping_cost_per_unit` is `null`, the prompt renders it as "unknown" (not `$null` or `$0`)
9. When `shipping_cost_per_unit` is `null`, the prompt instructs the model to add a shipping assumption to the `assumptions[]` array

### Bug 2 — Margin formula instructions (`buildAnalysisPrompt`)
10. Prompt includes the supplier margin formula: `(wholesale_price - landed_cost) / wholesale_price`
11. Prompt includes the retail margin formula: `(msrp - wholesale_price) / msrp`
12. Prompt includes an explicit instruction to verify margin consistency before returning JSON

### Bug 3 — Buyer insight grounding (`buildAnalysisPrompt`)
13. Prompt instructs the model to reference the exact calculated `supplier_margin` and `retail_margin` values in `buyer_perspective.insights`

### Playwright E2E (`tests/demo.spec.ts`)
14. Navigates to `http://localhost:5173` and finds the textarea
15. Types the demo input and submits; waits for all three loading phases to finish
16. Shipping per unit in the result is not $0.00
17. Landed cost total is greater than $2.00
18. Wholesale price is strictly between landed cost and MSRP
19. `supplier_margin` displayed is non-zero
20. `retail_margin` displayed is non-zero
21. "Buyer Intelligence" section is present in the DOM
22. Screenshot saved to `tests/screenshots/demo-output.png`

## Steps

1. **Install Playwright** — `npm install --save-dev @playwright/test && npx playwright install chromium` *(requires your approval of the package.json change)*

2. **Create `playwright.config.ts`** — set `baseURL`, `webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true }`, screenshot dir, `timeout: 60_000` (generous for Ollama + Groq latency)

3. **Write failing unit tests** for Bug 1 prompt changes (tests 1–5 above). Run → confirm fail.

4. **Write failing unit tests** for Bug 1 parseExtractionResponse changes (tests 6–7). Run → confirm fail.

5. **Write failing unit tests** for Bug 1 analysis prompt null-shipping (tests 8–9). Run → confirm fail.

6. **Write failing unit tests** for Bug 2 margin formulas (tests 10–12). Run → confirm fail.

7. **Write failing unit test** for Bug 3 buyer grounding (test 13). Run → confirm fail.

8. **Implement Bug 1 — extraction prompt**: add four few-shot examples to `buildExtractionPrompt` and null instruction. Run unit tests → pass.

9. **Implement Bug 1 — parser**: change `?? 0` to `?? null` in `parseExtractionResponse` for `shipping_cost_per_unit`. Update `ExtractedProduct` type. Run unit tests → pass.

10. **Implement Bug 1 — analysis prompt null-shipping**: in `buildAnalysisPrompt`, guard `shipping_cost_per_unit` — if null render "unknown" and add instruction to include assumption. Run unit tests → pass.

11. **Implement Bug 2**: add explicit margin formula block with verify instruction to `buildAnalysisPrompt`. Run unit tests → pass.

12. **Implement Bug 3**: add buyer-perspective grounding instruction to `buildAnalysisPrompt`. Run unit tests → pass.

13. **Run full unit test suite** — confirm all 85+ tests pass. Run linter.

14. **Write `tests/demo.spec.ts`** with all 9 Playwright assertions (tests 14–22). This is the final integration check — run it with the dev server live and Ollama running.

15. **Run Playwright test** — `npx playwright test tests/demo.spec.ts`. Confirm all assertions pass and screenshot is written.

## Out of scope

- Changes to `hts-client.ts`, `groq-client.ts`, `retailer-config.ts`
- Changes to any React components (`pricing-results.tsx`, `price-input-form.tsx`, `App.tsx`)
- Changes to `AIPricingAnalysis` interface (the analysis payload shape stays the same)
- Adding Playwright to the `npm test` script (it stays a separate `playwright test` command)
- Adding CI configuration for Playwright
- Changing any existing passing unit tests (only additive)

## Open questions

1. **`package.json` change**: Adding `@playwright/test` requires your approval per CLAUDE.md. Confirm before Step 1.
2. **Playwright timeout**: The full pipeline (Ollama extraction → Groq classification → USITC lookup → Ollama analysis) can take 30–90 seconds. I'll set a generous `timeout: 120_000` on the test. Is that acceptable, or do you want a shorter ceiling that would fail fast if something hangs?
3. **`shipping_cost_per_unit` type change**: Changing `ExtractedProduct.shipping_cost_per_unit` from `number` to `number | null` is a breaking type change. The only downstream consumer is `buildAnalysisPrompt`, which I will update. The existing `validExtraction` fixture in tests uses `0.5` (a number), so existing tests are unaffected. Confirm this type change is acceptable.
