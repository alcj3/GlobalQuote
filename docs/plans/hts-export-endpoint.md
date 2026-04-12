# HTS Export Endpoint Migration

## Goal

Replace the dead USITC `getrecord` endpoint in `hts-client.ts` with the working `exportList` endpoint, which returns a flat JSON array with rate data.

## Files to create/modify

- **`src/services/hts-client.ts`** — remove `buildHtsUrl` and `parseHtsResponse`, add `buildExportUrl` and `parseExportResponse`, update `lookupTariffRate` to use new functions
- **`src/services/hts-client.test.ts`** — replace all tests for `buildHtsUrl`/`parseHtsResponse` with tests for `buildExportUrl`/`parseExportResponse`; update `mockUsitcFetch` helper to match exportList response shape; add fallback tests

## Test cases

### `buildExportUrl`
1. Returns the correct USITC exportList URL for a given HTS code
2. URL-encodes the HTS code (handles dots correctly)
3. Trims whitespace from the code before embedding in the URL

### `parseExportResponse`
4. Parses `[{ general: "6%" }]` → 6
5. Parses `[{ general: "Free" }]` → 0
6. Parses `[{ general: "6.5%" }]` → 6.5
7. Returns null for a compound rate string (e.g. `"6.5¢/kg + 2%"`)
8. Returns null when the array is empty
9. Returns null when every item has an empty-string `general`
10. Skips items with empty `general` and returns the first item with a valid rate
11. Returns null when `general` is missing from all items

### `lookupTariffRate` (updated mock shape)
12. `mockUsitcFetch` helper updated — stubs fetch to return `[{ general: rate }]` (same shape, already works)
13. Existing 11 `lookupTariffRate` tests pass unchanged (no signature changes)

### Fallback behavior (new)
14. Returns null (not a throw) when exportList returns 0 results and no category map entry exists
15. When exportList returns results but all have empty `general`, returns null

## Steps

1. **Write failing tests** for `buildExportUrl` and `parseExportResponse` in `hts-client.test.ts` — remove old `buildHtsUrl`/`parseHtsResponse` test blocks, add new ones. Run tests → they must fail.

2. **Implement `buildExportUrl`** in `hts-client.ts`:
   ```ts
   const HTS_EXPORT_BASE = 'https://hts.usitc.gov/reststop/exportList'

   export function buildExportUrl(htsCode: string): string {
     const code = encodeURIComponent(htsCode.trim())
     return `${HTS_EXPORT_BASE}?from=${code}&to=${code}&format=JSON&styles=false`
   }
   ```

3. **Implement `parseExportResponse`** in `hts-client.ts`:
   ```ts
   export function parseExportResponse(raw: unknown): number | null {
     if (!Array.isArray(raw) || raw.length === 0) return null
     for (const item of raw) {
       const general = (item as Record<string, unknown>).general
       if (!general || typeof general !== 'string' || general.trim() === '') continue
       const text = general.trim()
       if (text.toLowerCase() === 'free') return 0
       const match = /^(\d+(?:\.\d+)?)%$/.exec(text)
       if (match) return parseFloat(match[1])
     }
     return null
   }
   ```

4. **Update `lookupTariffRate`** — replace the fetch block to use `buildExportUrl` and `parseExportResponse`. Remove `buildHtsUrl`, `parseHtsResponse`, and `HTS_API_BASE`. Run tests → all must pass.

5. **Run linter** and fix any issues.

6. **Run full test suite** — confirm all tests pass.

## Out of scope

- Changing `lookupTariffRate`'s signature or the `TariffResult` interface
- Handling 8-digit vs 10-digit code normalization (Groq returns variable precision; if exact match returns 0 results, we return null and the pipeline continues gracefully without a rate)
- Adding retry logic or code suffix padding
- Changing `COUNTRY_SURCHARGES`, `USMCA_COUNTRIES`, or `HTS_CATEGORY_MAP`
- Any changes to `groq-client.ts`, `ollama-client.ts`, or `App.tsx`

## Open questions

None — the user's spec is clear: use `from={hts_code}&to={hts_code}`, parse first non-empty `general`, fall back to null if no results. "Fall back to category map rate" in the original spec means: if Groq returns null, `lookupTariffRate` already falls back to `HTS_CATEGORY_MAP[category]` for the HTS code, then calls the export endpoint with that code. No additional fallback layer needed.
