# GlobalQuote

Pricing intelligence for U.S. importers — enter product costs in plain English and get landed cost, MSRP, margins, and retailer-specific buyer analysis in seconds.

## How it works

You describe your product in plain text: manufacturing cost, shipping, origin country, quantity, and target retailer. Groq's LLM extracts structured product data from that input, then a local HTS category map resolves the applicable tariff rate and any country-specific surcharges. A second Groq call uses those inputs to calculate landed cost, derive wholesale and MSRP from target margins, and generate buyer intelligence tailored to the specific retailer. Everything runs server-side in a Vercel serverless function — the API key never touches the browser.

## Stack

- React 19 + TypeScript + Vite
- Groq (`llama-3.3-70b-versatile`) for extraction and pricing analysis
- Vercel serverless functions (`api/analyze.ts`)
- Vitest + Testing Library for unit and integration tests

## Local setup

```bash
git clone https://github.com/alcj3/GlobalQuote.git
cd GlobalQuote
npm install
```

Create `.env.local` in the project root:

```
GROQ_API_KEY=your_key_here
```

Then start the dev server:

```bash
npm run dev
```

The app runs at `http://localhost:5173`. The `/api/analyze` endpoint is served by Vite's proxy in development.

## Tests

```bash
npm run test
```

71 tests across 7 files covering extraction parsing, tariff lookup, pricing analysis, retailer margin logic, and the HTTP handler.

## Known limitations

- Tariff rates reflect the HTS schedule as of early 2025. Rates introduced or modified after April 2025 — including additional Section 301 tranches and reciprocal tariff actions — are not reflected.
- Country surcharge coverage is limited to the major sourcing origins (China, Vietnam). Other countries fall back to the MFN base rate with no surcharge applied.
- The HTS category map covers broad product categories, not 10-digit HTS subheadings. Rates are directionally accurate for estimation but should not be used for customs filings.
