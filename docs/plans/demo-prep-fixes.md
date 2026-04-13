# Plan: Demo prep — 5 pre-demo fixes

## Goal

Fix a type error that breaks `npm run build`, remove a misleading "USITC" label from tariff output, sanitise user-visible Ollama error messages, eliminate the flickering "classifying" loading phase, and add an on-load warm-up ping plus soft/hard timeouts so a slow Ollama cold-start doesn't silently hang during the demo.

---

## Files to create/modify

| File | What changes |
|------|-------------|
| `src/services/ollama-client.ts` | (Fix 2) Change "USITC" → "HTS schedule (category map)" in tariff label string and assumptions entry. (Fix 3) Change both "Could not reach Ollama…" throws and both "Ollama returned HTTP…" throws to user-facing messages. (Fix 5) Add exported `warmOllama()` function. |
| `src/services/ollama-client.test.ts` | (Fix 1) Change `source: 'hts_api'` → `source: 'category_map'` in the `TariffResult` fixture at line 398. (Fix 3) Update the existing network-failure test matcher; add parallel test for `fetchAnalysis` network failure. (Fix 5) Add two tests for `warmOllama`. |
| `src/App.tsx` | (Fix 4) Remove `'classifying'` loading phase: delete from `LOADING_MESSAGES`, remove `setLoadingPhase('classifying')` call, narrow `loadingPhase` type. (Fix 5) Add `useEffect` on mount to call `warmOllama()`; add `slowWarning` state + 15s `useEffect` tied to `loadingPhase`; wrap pipeline in `Promise.race` with 90s hard timeout. |

---

## Test cases

All new/updated tests go in `src/services/ollama-client.test.ts`.

### Fix 1 — type error

No new test. Update the existing `TariffResult` fixture at line 398:
- Change `source: 'hts_api'` → `source: 'category_map'`

### Fix 3 — error message sanitisation

**Update existing test** (`extractProductData` describe block, line 194–197):
```
it('throws "Pricing service unavailable" on network failure') — matcher changes from /Could not reach Ollama/i to /Pricing service unavailable/i
```

**New test** (add to `extractProductData` describe block):
```
it('throws "Pricing service unavailable" on non-200 response') — matcher /Pricing service unavailable/i  [currently tests for /503/, needs to remain correct]
```
Actually the HTTP-status test currently asserts `/503/` — that's a separate throw. Leave it; only the network-failure matcher changes.

**New test** (`fetchAnalysis` describe block — add one):
```
it('throws "Pricing service unavailable" on network failure') — stub fetch to reject with TypeError, assert rejects.toThrow(/Pricing service unavailable/i)
```

### Fix 5 — warm-up ping

**New test** (`warmOllama` describe block — add two):
```
it('calls fetch to the /api/tags endpoint') — stub fetch, call warmOllama(), assert called with 'http://localhost:11434/api/tags'
it('resolves without throwing when fetch rejects') — stub fetch to reject, assert warmOllama() resolves (no throw)
```

Timeout behaviour in `App.tsx` (`slowWarning` state, `Promise.race`) is verified manually during the run step; unit-testing React timer behaviour adds significant setup complexity for marginal gain at demo time.

---

## Steps

### Fix 1 — type error (2 min)

1. In `src/services/ollama-client.test.ts` line 398, change `source: 'hts_api'` to `source: 'category_map'`.
2. Run `npm test -- --run` — all tests pass.
3. Run `npm run build` — confirm only the `vite.config.ts` TS error remains (the test-fixture error is gone).

---

### Fix 2 — remove "USITC" from tariff output (5 min)

In `src/services/ollama-client.ts`, inside `buildAnalysisPrompt`, update the `tariffInstruction` string (lines ~155–159):

- Line ~157: change
  ```
  "...${tariff.base_rate}% MFN + ${tariff.surcharge}% surcharge, USITC)"
  ```
  to
  ```
  "...${tariff.base_rate}% MFN + ${tariff.surcharge}% surcharge, HTS schedule)"
  ```
- Line ~159: change
  ```
  "Tariff rate sourced from USITC HTS API: ..."
  ```
  to
  ```
  "Tariff rate sourced from HTS category map: ..."
  ```

No test changes needed — no existing test asserts the presence of "USITC".

Run `npm test -- --run` — all tests still pass.

---

### Fix 3 — sanitise Ollama error messages (5 min)

In `src/services/ollama-client.ts`:

1. `extractProductData` (line ~133): change
   ```typescript
   throw new Error('Could not reach Ollama — make sure it is running at ' + OLLAMA_URL)
   ```
   to
   ```typescript
   throw new Error('Pricing service unavailable. Please try again.')
   ```

2. `extractProductData` (line ~138): change
   ```typescript
   throw new Error(`Ollama returned HTTP ${response.status}`)
   ```
   to
   ```typescript
   throw new Error(`Pricing service unavailable. Please try again. (HTTP ${response.status})`)
   ```

3. `fetchAnalysis` (line ~298): same change as step 1.

4. `fetchAnalysis` (line ~302): same change as step 2.

In `src/services/ollama-client.test.ts`:

5. In the `extractProductData` describe block, update the network-failure test matcher:
   - Change `rejects.toThrow(/Could not reach Ollama/i)` to `rejects.toThrow(/Pricing service unavailable/i)`

6. Add a new test in the `extractProductData` describe block (or create a new `fetchAnalysis` describe block):
   ```typescript
   it('throws "Pricing service unavailable" on fetchAnalysis network failure', async () => {
     vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
     await expect(fetchAnalysis(validExtraction)).rejects.toThrow(/Pricing service unavailable/i)
     vi.unstubAllGlobals()
   })
   ```

Run `npm test -- --run` — all tests pass.

---

### Fix 4 — remove classifying loading phase (10 min)

In `src/App.tsx`:

1. Update `LOADING_MESSAGES`:
   ```typescript
   const LOADING_MESSAGES: Record<string, string> = {
     extracting: 'Extracting product details...',
     analyzing:  'Running pricing analysis...',
   }
   ```

2. Update `loadingPhase` state type:
   ```typescript
   const [loadingPhase, setLoadingPhase] = useState<'extracting' | 'analyzing' | null>(null)
   ```

3. In `handleSubmit`, remove:
   ```typescript
   setLoadingPhase('classifying')
   ```
   The `lookupTariffRate` call stays on its own line, just without changing phase — it completes in < 1ms and needs no loading state.

No test changes needed — App.tsx has no unit tests.

Run `npm run build` — at this point both test-fixture error (Fix 1) and classifying type issue are resolved; only the pre-existing `vite.config.ts` error should remain. Confirm build output.

---

### Fix 5 — warm-up ping + timeouts (15 min)

**Part A — `warmOllama` in `ollama-client.ts`:**

Add this exported function at the top of the `// ─── Call 1: Extraction ───` section (before `buildExtractionPrompt`):

```typescript
export async function warmOllama(): Promise<void> {
  try {
    await fetch('http://localhost:11434/api/tags')
  } catch {
    // silently ignore — warm-up is best-effort
  }
}
```

Add two tests in `ollama-client.test.ts` in a new `warmOllama` describe block:

```typescript
describe('warmOllama', () => {
  it('calls fetch to the /api/tags endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', mockFetch)
    await warmOllama()
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/tags')
    vi.unstubAllGlobals()
  })

  it('resolves without throwing when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(warmOllama()).resolves.toBeUndefined()
    vi.unstubAllGlobals()
  })
})
```

Run `npm test -- --run` — new tests pass.

**Part B — App.tsx warm-up on mount:**

Add to imports:
```typescript
import { extractProductData, fetchAnalysis, warmOllama } from './services/ollama-client'
```
(replace existing `ollama-client` import line)

Add `useEffect` at the top of the `App` component body:
```typescript
import { useState, useEffect } from 'react'
// ...
useEffect(() => { void warmOllama() }, [])
```

**Part C — slow-warning state + 15s useEffect:**

Add state:
```typescript
const [slowWarning, setSlowWarning] = useState(false)
```

Add `useEffect` (after the warm-up effect):
```typescript
useEffect(() => {
  if (loadingPhase === null) {
    setSlowWarning(false)
    return
  }
  const timer = setTimeout(() => setSlowWarning(true), 15_000)
  return () => clearTimeout(timer)
}, [loadingPhase])
```

Update the loading message render:
```tsx
{loadingPhase && (
  <p className="results-placeholder">
    {slowWarning
      ? 'Analysis is taking longer than expected...'
      : LOADING_MESSAGES[loadingPhase]}
  </p>
)}
```

**Part D — 90s hard timeout in `handleSubmit` using `Promise.race`:**

```typescript
async function handleSubmit(message: string) {
  setLoadingPhase('extracting')
  setError(null)
  setAnalysis(null)

  const hardTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Pricing service unavailable. Please try again.')), 90_000)
  )

  try {
    const result = await Promise.race([runPipeline(message), hardTimeout])
    setAnalysis(result)
  } catch (err) {
    setError(err instanceof Error ? err.message : 'An unexpected error occurred')
  } finally {
    setLoadingPhase(null)
  }
}

async function runPipeline(message: string): Promise<AIPricingAnalysis> {
  const extracted = await extractProductData(message)
  setLoadingPhase('analyzing')
  const tariff = await lookupTariffRate(extracted.category, extracted.origin_country)
  const analysisPayload = await fetchAnalysis(extracted, tariff ?? undefined)
  return {
    product: extracted.product,
    category: extracted.category,
    origin_country: extracted.origin_country,
    quantity: extracted.quantity,
    target_retailer: extracted.target_retailer,
    ...analysisPayload,
  }
}
```

Note: `Promise.race` means the pipeline continues in the background after a 90s timeout. For the demo this is acceptable — the user sees an error and can resubmit.

Run `npm test -- --run` — all tests pass.
Run `npm run dev` — confirm dev server starts cleanly with no console errors.

---

## Out of scope

- China/Vietnam surcharge accuracy (25% / 20% vs. real 2026 rates) — not in this plan
- USMCA 0% tariff accuracy — not in this plan
- The pre-existing `vite.config.ts` TS error (`test` not in `UserConfigExport`) — not introduced this session, not blocking dev
- `groq-client.ts` dead code cleanup — not in this plan
- Any changes to `pricing-results.tsx`, `price-input-form.tsx`, or CSS files
- Any changes to `hts-category-map.json` or `retailer-config.ts`
- Playwright E2E tests — not updated this session

---

## Open questions

1. **Ollama URL constant** — `warmOllama` hardcodes `'http://localhost:11434/api/tags'` while the rest of `ollama-client.ts` uses a module-level `OLLAMA_URL` constant pointing at `/api/generate`. Should I extract a base URL constant (`http://localhost:11434`) and derive both paths from it, or just hardcode the tags URL alongside the generate URL?

2. **Hard timeout wording** — the 90s hard timeout shows "Pricing service unavailable. Please try again." — same string as the network error. Should it say something different, e.g. "Analysis timed out. Please try again." to distinguish from an outright failure?

3. **`runPipeline` as a nested function vs. extracted** — extracting it makes `handleSubmit` cleaner but adds a function that captures `setLoadingPhase` via closure. Either way is fine; flagging in case you have a style preference.
