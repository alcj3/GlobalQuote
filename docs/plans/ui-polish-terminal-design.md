# UI Polish — Terminal Design

## Goal

Redesign GlobalQuote's visual identity to a sharp, data-forward financial terminal aesthetic: dark background, IBM Plex type system, single amber accent, ledger-style cost breakdown, max 4px border-radius, one card elevation level.

---

## Current state (screenshots captured 2026-04-13)

| Before — empty state | Before — result state |
|---|---|
| `tests/screenshots/before-empty.png` | `tests/screenshots/demo-output.png` |

Problems with the current design:
- "Startup-cute" — rounded card (10px), rounded button (6px), soft multi-layer shadows
- Purple accent (`#aa3bff`) clashes with the commercial/trade context
- Light grey page background reads as a consumer web app, not a trade tool
- Numbers rendered in the same proportional font as labels — no tabular alignment
- Two uncoordinated CSS variable sets (`index.css` uses `--sans/--heading/--accent`; `App.css` uses `--color-*`) — both need updating

---

## Design tokens (new)

```
Background:    #0f1013   (body — near-black)
Card surface:  #18191f   (card bg)
Section row:   #1e1f27   (alternating row bg in ledger)
Border:        #2a2b33   (dividers, outlines)
Text primary:  #e2e3e9   (headings, values)
Text secondary:#6b6d7a   (labels, captions)
Accent:        #f5a623   (amber — ONE accent, no gradients)
Accent dim:    rgba(245,166,35,0.10)  (highlight bg)
Error bg:      #2a1515
Error text:    #f87171
```

Typography:
- UI / labels / headings: **IBM Plex Sans** (400, 500, 600) — loaded via Google Fonts
- Numbers / data values: **IBM Plex Mono** (400, 600) — loaded via Google Fonts
- Fallback stack (both): `system-ui, -apple-system, sans-serif` / `ui-monospace, Consolas, monospace`

---

## Files to create/modify

| File | What changes |
|------|-------------|
| `index.html` | Add Google Fonts preconnect + IBM Plex Sans + IBM Plex Mono stylesheet link |
| `src/index.css` | Update `--sans`, `--heading`, `--mono` font vars; update `--accent` to amber; update `--bg`, `--text`, `--text-h`, `--border` to dark palette; remove light-mode `prefers-color-scheme` block (we're committing to dark) |
| `src/App.css` | Full token overhaul: replace all `--color-*` with dark palette values; header becomes flush border-bottom bar (no opaque navy block); card gets 4px radius, single `0 0 0 1px var(--border)` box-shadow; error banner dark treatment |
| `src/components/price-input-form.css` | Dark textarea (bg `#0f1013`, border `--border`), focus border amber only (no blue ring), button amber with dark text, all radii → 2px |
| `src/components/pricing-results.css` | Ledger rows: `font-variant-numeric: tabular-nums`, `font-family: IBM Plex Mono`, 0px row radius, border-only total separator; MSRP row: amber left-border accent instead of blue bg; confidence badge updated to green/orange/red (dead CSS, but corrected for future); all remaining radii → 2–4px max |
| `src/components/pricing-results.tsx` | Add `className="ledger-value"` to `<dd>` elements inside landed cost, pricing, and margins sections only — this is the CSS hook for mono/tabular styling; no structural changes |
| `src/components/pricing-results.test.tsx` | Three new test cases verifying `ledger-value` class is present on the correct `<dd>` elements (TDD hook — these fail before the JSX change, pass after) |

---

## Test cases (write these first — they must fail before implementation)

All three go in `src/components/pricing-results.test.tsx`. They only need a minimal `analysis` fixture — the existing mock in that file can be reused.

```
it('applies ledger-value class to all landed cost breakdown values')
  → render PricingResults with a full analysis fixture
  → query all <dd> inside the "Landed Cost Breakdown" section
  → assert each has className containing "ledger-value"

it('applies ledger-value class to suggested pricing values')
  → same fixture
  → query <dd> inside the "Suggested Pricing" section
  → assert each has "ledger-value"

it('applies ledger-value class to margin values')
  → same fixture
  → query <dd> inside the "Margins" section
  → assert each has "ledger-value"
```

**NOT tested** (CSS-only, no unit test value):
- Color values, font names, border-radius — these are verified by Playwright screenshot, not unit tests

---

## Implementation steps

1. Write the three failing tests in `pricing-results.test.tsx`. Run `npm test` — confirm they fail on the missing class.

2. Add `className="ledger-value"` to the `<dd>` elements in:
   - Landed Cost Breakdown section (manufacturing, shipping, tariff, additional, total)
   - Suggested Pricing section (MSRP, wholesale)
   - Margins section (retail margin, supplier margin)
   - Do NOT add to Details section (product, category, origin — these are text, not numbers)

3. Run tests — confirm the three new tests now pass, all 102 existing tests still pass.

4. Add Google Fonts link to `index.html`:
   ```html
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
   <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
   ```

5. Rewrite `src/index.css`:
   - Replace font vars: `--sans: 'IBM Plex Sans', system-ui, sans-serif`; `--heading: 'IBM Plex Sans', system-ui, sans-serif`; `--mono: 'IBM Plex Mono', ui-monospace, monospace`
   - Replace `--accent: #f5a623` (amber)
   - Replace `--bg: #0f1013`, `--text-h: #e2e3e9`, `--text: #6b6d7a`, `--border: #2a2b33`
   - Remove the `@media (prefers-color-scheme: dark)` block entirely — dark is the only theme
   - Remove the `#social` filter rule (not used in this app)
   - Keep `h1`, `h2`, `p`, `code` base styles; update colors to match new tokens

6. Rewrite `src/App.css`:
   - New `--color-*` token set (see design tokens above)
   - `.app-header`: `background: var(--bg)`, `border-bottom: 1px solid var(--border)`, no color block
     - `h1` inside header: `color: var(--accent)` (amber wordmark)
     - subtitle: `color: var(--text-secondary)`
   - `.card`: `background: var(--card-bg)`, `border-radius: 4px`, `box-shadow: 0 0 0 1px var(--border)` only
   - `.error-banner`: `background: var(--error-bg)`, `color: var(--error-text)`
   - Page body: `background: var(--bg)`

7. Rewrite `src/components/price-input-form.css`:
   - `.form-textarea`: `background: #0f1013`, `border: 1px solid var(--color-border)`, `color: var(--color-text-primary)`, `border-radius: 2px`
   - `.form-textarea:focus`: `border-color: var(--color-accent)` only — no `box-shadow` ring
   - `.form-submit`: `background: var(--color-accent)`, `color: #0f1013` (dark text on amber), `border-radius: 2px`
   - `.form-submit:hover`: slightly darker amber (`#d4921f`)
   - All other radii → 2px

8. Rewrite `src/components/pricing-results.css`:
   - `.results-row`: `border-radius: 0`, alternating bg via `--section-bg`
   - `.results-row dd` (all): `font-family: var(--mono)`, `font-variant-numeric: tabular-nums`
   - `.ledger-value`: `font-family: 'IBM Plex Mono', ui-monospace, monospace`, `font-variant-numeric: tabular-nums` (this is the hook from step 2)
   - `.results-row-total`: `border-top: 1px solid var(--color-border)` — no radius
   - `.results-tariff-rate` (the verbose AI-generated breakdown string under "Tariff"): `display: block`, `white-space: normal`, `word-break: break-word`, `font-size: 0.6875rem`, `line-height: 1.4`, `max-width: 320px`, `color: var(--color-text-secondary)` — wraps gracefully as a subordinate note; no parsing of the AI string needed
   - `.results-row-msrp`: replace blue bg with `background: var(--accent-dim)`, `border-left: 2px solid var(--color-accent)` — no blue
   - `.confidence-badge--strong`: `background: rgba(34,197,94,0.12)`, `color: #4ade80`
   - `.confidence-badge--risky`: `background: rgba(249,115,22,0.12)`, `color: #fb923c`
   - `.confidence-badge--weak`: `background: rgba(239,68,68,0.12)`, `color: #f87171`
   - `.confidence-badge--good`: fold into `--strong` styles (only 3 states per constraint)
   - All radii → 2–4px max

9. Run full test suite: `npm test`. Expect 105/105 passing (102 existing + 3 new).

10. Run linter: `npm run lint`. Fix any issues.

11. Take Playwright screenshots (after/result states) and visually verify against the design direction brief. Save to `tests/screenshots/after-empty.png` and `tests/screenshots/after-result.png`.

---

## Out of scope

- No changes to service logic (`hts-client.ts`, `ollama-client.ts`, `retailer-config.ts`)
- No new components, no layout restructuring
- No changes to `package.json` — fonts loaded via CDN link only
- Not fixing the `vite.config.ts` build TS error (separate task)
- Not updating China tariff rate or USMCA accuracy
- No dark/light theme toggle — committing to dark only
- No animations, transitions beyond the existing `transition: border-color 0.15s` on inputs

---

## Open questions

1. **Google Fonts CDN**: The plan loads IBM Plex via Google Fonts. If you want zero external requests (offline demo), I can fall back to the system mono/sans stack instead — still sharp, just less distinctive.

2. **Confidence badge dead CSS**: The badge is no longer rendered (removed last session). I'll update its color values to the new palette anyway (green/orange/red) so the CSS is correct if it comes back. If you'd prefer to delete the badge CSS entirely as dead code, say so and I'll remove it in step 8.

3. **Header treatment**: Current plan removes the opaque navy header block — header becomes flush with the dark page background, separated by a single 1px border. The "GlobalQuote" wordmark gets the amber accent color. Confirm this matches your intent or if you want a distinct header surface color.
