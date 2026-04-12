/**
 * One-time script: queries the USITC search endpoint for each product category,
 * takes the first result with a valid 8+ digit HTS code and simple rate,
 * and writes src/services/hts-category-map.json.
 *
 * Run: npx tsx scripts/build-hts-map.ts
 *
 * After running, manually inspect the output JSON and correct any wrong entries
 * (USITC keyword search often returns off-topic results for plain-English queries).
 */

import { writeFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEARCH_BASE = 'https://hts.usitc.gov/reststop/search'
const OUT_PATH = resolve(__dirname, '../src/services/hts-category-map.json')

// Simple rate: "X%", "X.X%", or "Free" — rejects compound rates like "6.5¢/kg + 2%"
const SIMPLE_RATE_RE = /^(\d+(?:\.\d+)?%|Free)$/i

interface SearchResult {
  htsno: string
  description: string
  general: string
}

interface MapEntry {
  hts_code: string
  general_rate: string
  description: string
}

// ─── Category definitions ──────────────────────────────────────────────────
// Includes the 5 legacy keys used by extraction (Option B) + 18 specific keys.
// Legacy keys are searched with focused queries; results will need manual review.

const CATEGORIES: Array<{ key: string; query: string }> = [
  // ── Legacy keys (must remain for extraction fallback) ──
  { key: 'clothing',              query: 'knit shirts t-shirts blouses cotton men women' },
  { key: 'food',                  query: 'food preparations mixed compound' },
  { key: 'electronics',           query: 'automatic data processing machines portable laptop' },
  { key: 'home_goods',            query: 'ceramic tableware mugs cups plates porcelain' },

  // ── New specific keys ──
  { key: 'clothing_tops',         query: 'T-shirts singlets knitted cotton men women' },
  { key: 'clothing_bottoms',      query: 'trousers pants jeans bib overalls cotton men' },
  { key: 'clothing_outerwear',    query: 'jackets coats anoraks woven men women' },
  { key: 'footwear',              query: 'footwear leather uppers rubber soles' },
  { key: 'bags_luggage',          query: 'handbags travel bags backpacks leather' },
  { key: 'food_processed',        query: 'food preparations homogenized compound mixed' },
  { key: 'food_beverages',        query: 'fruit juices beverages non-alcoholic' },
  { key: 'electronics_computers', query: 'automatic data processing machines laptop portable' },
  { key: 'electronics_phones',    query: 'telephone sets smartphones cellular network' },
  { key: 'electronics_accessories', query: 'electrical apparatus sound recording speakers' },
  { key: 'home_ceramics',         query: 'ceramic tableware mugs cups plates porcelain' },
  { key: 'home_furniture',        query: 'wooden furniture seats chairs tables' },
  { key: 'home_textiles',         query: 'bed linen sheets towels cotton' },
  { key: 'toys_games',            query: 'toys games dolls children' },
  { key: 'sporting_goods',        query: 'sports equipment exercise gymnasium' },
  { key: 'jewelry',               query: 'jewelry gold silver precious metal articles' },
  { key: 'cosmetics',             query: 'cosmetics beauty preparations skin care' },
  { key: 'other',                 query: 'miscellaneous manufactured articles' },
]

// ─── Helpers ───────────────────────────────────────────────────────────────

async function searchHTS(query: string): Promise<SearchResult[]> {
  const url = `${SEARCH_BASE}?keyword=${encodeURIComponent(query)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`USITC search HTTP ${res.status} for "${query}"`)
  return res.json() as Promise<SearchResult[]>
}

function firstValidResult(results: SearchResult[]): SearchResult | null {
  return results.find(
    (r) =>
      typeof r.htsno === 'string' &&
      r.htsno.replace(/\./g, '').length >= 8 &&
      typeof r.general === 'string' &&
      SIMPLE_RATE_RE.test(r.general.trim()),
  ) ?? null
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const map: Record<string, MapEntry> = {}
  const failures: string[] = []

  for (const { key, query } of CATEGORIES) {
    process.stdout.write(`  ${key.padEnd(28)} `)
    try {
      const results = await searchHTS(query)
      const hit = firstValidResult(results)
      if (hit) {
        map[key] = {
          hts_code: hit.htsno,
          general_rate: hit.general.trim(),
          description: hit.description ?? '',
        }
        console.log(`→ ${hit.htsno}  (${hit.general.trim()})  ${(hit.description ?? '').substring(0, 60)}`)
      } else {
        console.log('✗ no valid result found')
        failures.push(key)
      }
    } catch (err) {
      console.log(`✗ error: ${err instanceof Error ? err.message : String(err)}`)
      failures.push(key)
    }
    // Brief pause to avoid hammering the USITC server
    await new Promise((r) => setTimeout(r, 300))
  }

  await writeFile(OUT_PATH, JSON.stringify(map, null, 2) + '\n', 'utf-8')
  console.log(`\nWrote ${OUT_PATH}`)

  if (failures.length > 0) {
    console.log('\n⚠ Categories needing manual HTS codes:')
    failures.forEach((k) => console.log(`  - ${k}`))
  } else {
    console.log('\n✓ All categories resolved — review output before committing.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
