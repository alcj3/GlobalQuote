# Feature 1: Smart Price Suggestions

## Goal

Build a client-side pricing calculator that takes a supplier's cost inputs and returns a structured MSRP, wholesale price, and margin breakdown for the U.S. market.

---

## Files to Create / Modify

| Path | Action | What changes |
|------|--------|--------------|
| `src/services/pricing-engine.ts` | **Create** | Pure functions: `calculateTotalCost`, `calculateRetailRange`, `calculateMSRP`, `calculateWholesale`, `calculateMargins`, `generatePricingAnalysis`. No side effects, no React. |
| `src/services/pricing-engine.test.ts` | **Create** | Vitest unit tests for all pricing-engine functions (see Test Cases below). |
| `src/components/price-input-form.tsx` | **Create** | Controlled form component. Emits `onSubmit(inputs)`. Fields: product name, category select, manufacturing cost, shipping cost, additional costs (optional). |
| `src/components/price-input-form.test.tsx` | **Create** | RTL tests: renders all fields, validates required fields, calls onSubmit with correct shape. |
| `src/components/pricing-results.tsx` | **Create** | Display-only component. Receives a `PricingAnalysis` object and renders the structured output table. |
| `src/components/pricing-results.test.tsx` | **Create** | RTL tests: renders all output fields with correct formatted values. |
| `src/App.tsx` | **Modify** | Replace Vite boilerplate. Wire up `PriceInputForm` + `PricingResults` with local `useState`. |
| `src/App.css` | **Modify** | Strip Vite boilerplate styles. Add minimal layout styles for the calculator. |
| `package.json` | **Modify** (needs approval) | Add `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` to `devDependencies`. Add `"test": "vitest"` and `"test:watch": "vitest --watch"` scripts. |
| `vite.config.ts` | **Modify** (needs approval) | Add `test: { environment: 'jsdom' }` to enable Vitest browser-like environment. |

---

## Data Types

```ts
type Category = 'clothing' | 'food' | 'electronics' | 'home_goods' | 'other'

interface CostInputs {
  productName: string
  category: Category
  manufacturingCost: number
  shippingCost: number
  additionalCosts: number  // defaults to 0
}

interface PricingAnalysis {
  productName: string
  category: Category
  totalCost: number
  retailPriceMin: number
  retailPriceMax: number
  msrp: number           // psychological pricing (see rounding rules)
  wholesalePrice: number // ~50% of MSRP, clean number (whole or .5)
  retailMargin: number   // percentage, e.g. 50.0
  supplierMargin: number // percentage
  assumptions: string[]  // any assumptions made (e.g. "Additional costs assumed $0")
}
```

---

## Pricing Logic (pricing-engine.ts)

**Category multipliers** (min, max → midpoint):

| Category    | Range    | Midpoint |
|-------------|----------|----------|
| clothing    | 2.5–4.0x | 3.25x    |
| food        | 1.5–3.0x | 2.25x    |
| electronics | 1.2–2.5x | 1.85x    |
| home_goods  | 2.0–3.5x | 2.75x    |
| other       | 2.0–3.0x | 2.50x    |

**MSRP psychological pricing:**
- Raw MSRP = `totalCost × midpoint`
- Under $30 → snap to `.99` (e.g. `$24.99`)
- $30–$100 → snap to nearest `.99` or whole dollar, whichever is cleaner (e.g. `$49.99` or `$50`)
- Above $100 → round to nearest `$5` or `$10` (e.g. `$120`, `$150`)

**Retail range** = apply the same psychological rounding to `totalCost × min` and `totalCost × max`.

**Wholesale pricing (clean numbers):**
- Raw wholesale = `MSRP × 0.50`
- Round to nearest whole dollar; if remainder is exactly `$0.50`, keep `.5` (e.g. `$12.5`)
- Never produce complex decimals like `$12.37`

**Margins (calculated after rounding):**
- Retail margin = `(MSRP - wholesale) / MSRP × 100`
- Supplier margin = `(wholesale - totalCost) / wholesale × 100`

---

## Test Cases

### pricing-engine.test.ts

1. `calculateTotalCost` — sums all three cost fields correctly
2. `calculateTotalCost` — treats missing additionalCosts as 0
3. `calculateRetailRange('clothing', 10)` — returns `[25, 40]`
4. `calculateRetailRange('electronics', 100)` — returns `[120, 250]`
5. `applyMSRPRounding(32.5)` — under $30 threshold not met → returns `$32.99` (nearest .99 in $30–$100 band)
6. `applyMSRPRounding(8.75)` — under $30 → returns `$8.99`
7. `applyMSRPRounding(225)` — above $100 → rounds to nearest $5 → `$225`
8. `applyMSRPRounding(163)` — above $100 → rounds to nearest $5 → `$165`
9. `calculateMSRP('clothing', 10)` — raw 32.5 → psychological rounding → `$32.99`
10. `calculateMSRP('electronics', 100)` — raw 185 → above $100 → `$185`
11. `calculateWholesale(100)` — returns `50`
12. `calculateWholesale(33)` — `33 × 0.5 = 16.5` → returns `16.5`
13. `calculateWholesale(49.99)` — `49.99 × 0.5 = 24.995` → rounds to `25`
14. `calculateMargins(msrp=100, wholesale=50, totalCost=20)` — retail 50%, supplier 60%
15. `calculateMargins` — supplier margin is 0 when wholesale equals totalCost
16. `generatePricingAnalysis` — full integration: clothing, mfg=10, ship=2, additional=0 → correct full object
17. `generatePricingAnalysis` — adds assumption string when additionalCosts not provided
18. `generatePricingAnalysis` — MSRP and wholesale never have complex decimals (only .99, .5, or whole)

### price-input-form.test.tsx

14. Renders fields: product name, category, manufacturing cost, shipping cost, additional costs
15. Category dropdown has all 5 options
16. Submit with valid inputs calls `onSubmit` with correct `CostInputs` shape
17. Submit without product name shows validation error / does not call `onSubmit`
18. Submit without manufacturing cost shows validation error
19. Additional costs field is optional (empty → 0 in output)

### pricing-results.test.tsx

22. Renders all output labels (Product, Category, Total Cost, MSRP, Wholesale, Retail Margin, Supplier Margin)
23. Formats whole-dollar prices as `$120` (no decimals), `.99` prices as `$49.99`, `.5` prices as `$12.50`
24. Formats margins as `XX.X%`
25. Shows retail price range in `$min – $max` format
26. Renders assumptions section when assumptions array is non-empty
27. Renders nothing (or placeholder) when passed `null`

---

## Steps

1. **Add test dependencies** — update `package.json` and `vite.config.ts` (**approved**)
2. **Write pricing-engine tests** — all 13 cases above; run `npm run test` → all fail
3. **Implement `pricing-engine.ts`** — implement functions until all 13 tests pass
4. **Write `price-input-form` tests** — 6 cases above; run → all fail
5. **Implement `price-input-form.tsx`** — implement until 6 tests pass
6. **Write `pricing-results` tests** — 6 cases above; run → all fail
7. **Implement `pricing-results.tsx`** — implement until 6 tests pass
8. **Wire up `App.tsx`** — Option B shell: branded header (`GlobalQuote` + tagline), calculator card below. `PriceInputForm` + `PricingResults` inside the card. State: `useState<PricingAnalysis | null>`
9. **Update `App.css`** — strip Vite boilerplate, add minimal layout: header bar, centered card, responsive padding
10. **Full test suite** — run `npm run test`; all 27 cases green
11. **Lint** — run `npm run lint`; fix any issues
12. **Commit** — one commit: `feat: smart price suggestions calculator`

---

## Out of Scope

- Backend / FastAPI endpoint — all logic is client-side
- Database persistence — no saving of quotes
- Authentication / user accounts
- Currency conversion (inputs and outputs are USD only)
- PDF / export functionality
- Sharing or emailing results
- The Claude AI API — pricing is deterministic math, not LLM inference

---

## Decisions Recorded

1. **Test dependencies** — approved. Adding `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`.
2. **MSRP rounding** — psychological pricing: under $30 → `.99`; $30–$100 → nearest `.99` or whole; above $100 → nearest $5/$10.
3. **Wholesale rounding** — nearest whole dollar; keep `.5` if exactly half; never complex decimals.
4. **App shell** — Option B: branded header (`GlobalQuote` + tagline) with calculator card below.
