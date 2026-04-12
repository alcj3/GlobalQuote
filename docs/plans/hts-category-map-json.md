# HTS Category Map JSON

## Goal

Replace the 4-entry hardcoded `HTS_CATEGORY_MAP` in `hts-client.ts` with a JSON file populated by a one-time script that queries the USITC search endpoint, covering 18 product categories with their resolved HTS codes and MFN rates.

## Files to create/modify

- **`scripts/build-hts-map.ts`** *(create)* — one-time script that queries USITC search for each category, filters valid results, and writes `hts-category-map.json`
- **`src/services/hts-category-map.json`** *(create, generated then hand-edited)* — maps 18 category keys → `{ hts_code, general_rate, description }`
- **`src/services/hts-client.ts`** — remove hardcoded `HTS_CATEGORY_MAP`, import from JSON, update the fallback lookup to use the JSON map
- **`src/services/hts-client.test.ts`** — update the one test that hardcodes `'6912.00'` to use a regex match instead of a literal string
- **`tsconfig.app.json`** — add `"resolveJsonModule": true` so TypeScript accepts the JSON import
- **`src/services/ollama-client.ts`** — update the `buildExtractionPrompt` allowed category list to include the expanded set
- **`src/services/ollama-client.test.ts`** — update the field-names test that checks all 9 fields to remain passing (no change needed; category list change is in prompt text not field names)

## Categories

The script defines these 18 category keys and their USITC search queries:

| Key | Search query |
|-----|-------------|
| `clothing_tops` | `T-shirts singlets knitted cotton men women` |
| `clothing_bottoms` | `trousers pants jeans cotton men women` |
| `clothing_outerwear` | `jackets coats anoraks woven men women` |
| `footwear` | `footwear leather uppers rubber soles` |
| `bags_luggage` | `handbags travel bags backpacks leather` |
| `food_processed` | `food preparations homogenized mixed` |
| `food_beverages` | `fruit juices beverages non-alcoholic` |
| `electronics_computers` | `automatic data processing machines laptop portable` |
| `electronics_phones` | `telephone sets smartphones` |
| `electronics_accessories` | `electrical apparatus sound recording` |
| `home_ceramics` | `ceramic tableware mugs cups plates porcelain` |
| `home_furniture` | `wooden furniture seats chairs tables` |
| `home_textiles` | `bed linen sheets towels cotton` |
| `toys_games` | `toys games dolls children` |
| `sporting_goods` | `sports equipment exercise gymnasium` |
| `jewelry` | `jewelry gold silver precious metal` |
| `cosmetics` | `cosmetics beauty preparations skin care` |
| `other` | `miscellaneous manufactured articles` |

The existing 4 keys (`clothing`, `food`, `electronics`, `home_goods`) are dropped from `hts-client.ts` in favour of the new keys. The extraction prompt's allowed categories are updated to match.

## Test cases

All new tests are **additive only** — no existing passing tests are deleted.

### `hts-client.test.ts` — one update, one new
1. *(update)* `falls back to HTS_CATEGORY_MAP when classifyHTS returns null` — change `expect(result!.hts_code).toBe('6912.00')` to `expect(result!.hts_code).toMatch(/^\d{4}\.\d{2}/)` so the test validates format rather than a specific code that can change with the JSON
2. *(new)* `lookupTariffRate falls back to JSON map for home_ceramics category` — mock Groq returning null, verify a non-null result is returned when origin is Japan (proving JSON map is wired up)

### `ollama-client.test.ts` — one new
3. *(new)* `buildExtractionPrompt includes home_ceramics in the allowed category list` — replaces nothing, just documents that the extraction prompt now lists the expanded categories

## Steps

1. **Add `"resolveJsonModule": true` to `tsconfig.app.json`** — needed for the JSON import in `hts-client.ts`. Run `npm run build` to confirm no TS errors. *(No tests needed for a tsconfig change.)*

2. **Write `scripts/build-hts-map.ts`** — standalone script using Node's built-in `fetch` and `fs/promises`. Does NOT import any src/ files to avoid Vite/bundler module resolution issues. Structure:
   ```ts
   const CATEGORIES = [{ key: 'clothing_tops', query: '...' }, ...]
   // For each category: GET search endpoint, filter htsno.length >= 8
   //   and general matches simple rate regex or 'Free'
   // Take first valid result; log failures
   // Write JSON to src/services/hts-category-map.json
   ```
   Run: `node --experimental-strip-types scripts/build-hts-map.ts`

3. **Inspect output JSON and manually correct wrong entries** — USITC search routinely returns off-topic results for plain-English queries (verified: "cotton knit t-shirts" → sugar beet). Expected corrections include:
   - `home_ceramics` → `6912.00.44` (mugs), not whatever the search returns
   - `electronics_computers` → `8471.30` (portable ADP machines)
   - `clothing_tops` → `6109.10` (cotton knit shirts)
   Hand-edit `src/services/hts-category-map.json` until all 18 entries are plausible.

4. **Write failing unit tests** (tests 1–3 above). Run → confirm failures.

5. **Update `hts-client.ts`**:
   - Remove `export const HTS_CATEGORY_MAP`
   - Add `import htsCategoryMapData from './hts-category-map.json'`
   - Derive the fallback lookup as `const HTS_CATEGORY_MAP: Record<string, string> = Object.fromEntries(Object.entries(htsCategoryMapData).map(([k, v]) => [k, v.hts_code]))`
   - Keep the same fallback line: `const hts_code = groqResult?.hts_code ?? HTS_CATEGORY_MAP[category] ?? null`
   Run tests → confirm test 1 and 2 pass.

6. **Update `ollama-client.ts` extraction prompt** — replace the category list `clothing, food, electronics, home_goods, other` with the 18 new keys. Run tests → confirm test 3 passes.

7. **Run full test suite** — `npm test -- --run`. Confirm all tests pass.

8. **Run linter** — `npm run lint`. Fix any issues.

9. **Commit** — `scripts/build-hts-map.ts` (the script), `src/services/hts-category-map.json` (hand-edited output), and all modified source/test files in one commit.

## Out of scope

- Changing `COUNTRY_SURCHARGES`, `USMCA_COUNTRIES`, or any tariff rate logic
- Changing `parseExportResponse`, `buildExportUrl`, `lookupTariffRate` signatures
- Changing `groq-client.ts` or `retailer-config.ts`
- Automating the manual review (the script intentionally stops after writing the JSON)
- Adding the script to `package.json` scripts (it runs once, not repeatedly)
- CI changes or Playwright test changes

## Open questions

1. **Extraction category list change**: Expanding from 5 to 18 category keys means the extraction LLM must now produce one of 18 values. A smaller model (llama3.2 3B) may hallucinate a category name that doesn't exist in the map, causing the fallback to miss. **Do you want to expand the extraction category list to all 18, or keep the 5 broad buckets for extraction and only use the new keys as sub-categories internally?** If we keep 5 broad buckets, the JSON map needs to keep the original 4 keys too (clothing, food, electronics, home_goods), and the 18 new ones become extras.

2. **`HTS_CATEGORY_MAP` export**: The existing export is used by no files outside `hts-client.ts`. OK to make it module-private (remove `export`)? This would require updating any test that imports it directly (none do currently).

3. **Script runner**: `ts-node` is not installed and `npx ts-node` won't work well with this ESM project. The plan uses `node --experimental-strip-types` (Node 24 built-in). Confirmed working locally. Acceptable?
