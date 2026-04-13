# Landing Page

## Goal

Build a self-contained static landing page (pure HTML + CSS, no React) that matches the terminal/amber aesthetic, lives alongside the Vite app in the same repo, and builds to `dist/landing/` for future deployment.

---

## Architecture decision: Vite multi-page app (MPA)

Vite has first-class support for multiple HTML entry points via `rollupOptions.input`. The cleanest "deployed together but separated" setup:

| URL | Entry file | Built output |
|-----|-----------|-------------|
| `/` | `index.html` | `dist/index.html` (React app — unchanged) |
| `/landing/` | `landing/index.html` | `dist/landing/index.html` (static landing) |

During dev: `http://localhost:5173/landing/` serves the landing page live.  
The React app at `/` is completely untouched.  
Vercel routing (rewrites, redirects) will be configured in a separate deployment plan — the output structure here makes it trivial to swap which URL maps to which file later.

---

## Content (draft — subject to your edits before implementation)

**Wordmark**: `GlobalQuote`

**Hero headline**: "Know your landed cost before you pitch."

**Sub-headline**: "Tariffs. Margins. Retail pricing. Calculated in seconds."

**Problem/solution body** (2–3 sentences):
> Most suppliers quote blind — guessing margins and losing deals when tariffs hit. GlobalQuote extracts your product details, looks up the current HTS tariff rate, and runs a full landed cost and pricing analysis with buyer-ready numbers in under a minute.

**CTA button**: "Request Early Access" → `mailto:YOUR_EMAIL?subject=GlobalQuote Early Access`

---

## Files to create/modify

| File | What changes |
|------|-------------|
| `landing/index.html` | New — self-contained landing page. Inline CSS or linked `landing.css`. Loads IBM Plex from Google Fonts. No JS required. |
| `landing/landing.css` | New — terminal/amber styles scoped to this page only. Mirrors the token set from `src/App.css` but standalone (no Vite imports). |
| `vite.config.ts` | Add `build.rollupOptions.input` with both `index.html` and `landing/index.html` entries. Also fixes the pre-existing TS error by moving `test` config to `vitest.config.ts`. |
| `vitest.config.ts` | New — extracted vitest config (environment, setupFiles, exclude). Fixes `npm run build` TS error. |

**Note on the TS build error**: `vite.config.ts` currently has `test: { ... }` which causes `'test' does not exist in type 'UserConfigExport'` on `npm run build`. Moving vitest config to a separate `vitest.config.ts` fixes this at the same time — it's a prerequisite for `vite.config.ts` to be clean enough to add the MPA `build` config without confusion.

---

## Test cases

The landing page is static HTML/CSS — no component logic to unit-test. Tests will verify the built output and dev-server availability via Playwright:

```
it('landing page loads at /landing/ with status 200')
  → navigate to http://localhost:5173/landing/
  → assert page title contains "GlobalQuote"
  → assert the hero headline text is present
  → assert the CTA button has a mailto href

it('CTA button href is a valid mailto link')
  → find the element with text "Request Early Access"
  → assert href starts with "mailto:"
  → assert href contains a subject param

it('React app is unaffected — still loads at /')
  → navigate to http://localhost:5173/
  → assert "Get Pricing" button is present
```

These are Playwright tests, added to `tests/landing.spec.ts`.

**Note**: Vitest unit tests are unaffected — 105/105 should still pass after the config split.

---

## Implementation steps

1. Create `vitest.config.ts` with the extracted test config:
   ```ts
   import { defineConfig } from 'vitest/config'
   import react from '@vitejs/plugin-react'
   export default defineConfig({
     plugins: [react()],
     test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], exclude: ['**/node_modules/**', '**/tests/**'] },
   })
   ```
   Remove the `test` block from `vite.config.ts`. Run `npm test` — confirm 105/105 still pass. Run `npm run build` — confirm TS error is gone.

2. Add MPA input to `vite.config.ts`:
   ```ts
   import { resolve } from 'path'
   build: {
     rollupOptions: {
       input: {
         main: resolve(__dirname, 'index.html'),
         landing: resolve(__dirname, 'landing/index.html'),
       }
     }
   }
   ```

3. Write the three Playwright tests in `tests/landing.spec.ts` (failing — landing page doesn't exist yet).

4. Create `landing/landing.css` with the terminal/amber token set:
   - Same `--bg: #0f1013`, `--card: #18191f`, `--border: #2a2b33`, `--text: #e2e3e9`, `--text-dim: #6b6d7a`, `--accent: #f5a623`
   - IBM Plex Sans loaded via Google Fonts link in the HTML
   - Styles for: body, `.lp-header`, `.lp-hero`, `.lp-headline`, `.lp-body`, `.lp-cta`
   - No rounded corners > 4px, no gradients, no shadows beyond a single border

5. Create `landing/index.html`:
   - `<link>` to Google Fonts (IBM Plex Sans) and `landing.css`
   - Header: amber `GlobalQuote` wordmark + 1px border-bottom (matches app header)
   - Hero section: large headline, subhead, body copy, CTA button
   - `<a href="mailto:...?subject=GlobalQuote%20Early%20Access" class="lp-cta">Request Early Access</a>`
   - Footer: one-liner (`© 2026 GlobalQuote`) — minimal

6. Run Playwright tests — confirm all three pass.

7. Run `npm run build` — confirm `dist/landing/index.html` is present in the output.

8. Screenshot `http://localhost:5173/landing/` with Playwright. Confirm it matches the terminal aesthetic.

---

## Out of scope

- No backend, no form submission, no email collection database
- No React components on the landing page — pure HTML/CSS only
- No animation or scroll effects
- No mobile-specific breakpoints beyond a single `max-width` media query for the hero text
- No changes to the React app source, tests, or services
- Vercel deployment config (`vercel.json`, rewrites, domain routing) — future plan
- Whether the landing page eventually moves to `/` and the app to `/app` — future plan

---

## Resolved

1. **Email**: `lopez115@uw.edu`
2. **Copy**: Draft-and-edit-live — copy will be written directly into the HTML; edit the file afterward.
3. **Footer**: Omitted.
