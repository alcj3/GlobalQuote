# Vercel Deployment

## Goal

Configure GlobalQuote for production deployment on Vercel — landing page and React app both served from the same project, with environment variables wired correctly and the Ollama localhost dependency removed.

---

## Critical blocker: Ollama is hardcoded to localhost

`src/services/ollama-client.ts` line 4:
```ts
const OLLAMA_BASE = 'http://localhost:11434'
```

When the app is deployed to Vercel, every analysis request will fail — the browser will try to reach `localhost:11434` on the visitor's machine, not a server. **The landing page deploys and works immediately. The React app loads but all analysis calls return errors until this is resolved.**

### Two paths to fix it

**Path A — Make the URL configurable (quick, requires hosting Ollama yourself)**
Change `OLLAMA_BASE` to read from `import.meta.env.VITE_OLLAMA_BASE_URL` with a localhost fallback. Then set `VITE_OLLAMA_BASE_URL=https://your-ollama.fly.io` in Vercel's environment variable dashboard. Requires you to run Ollama on a cloud VM (Fly.io, Railway, DigitalOcean, etc.) separately.

**Path B — Migrate analysis calls to Groq + Vercel serverless function (recommended)**
Replace `ollama-client.ts` with calls to a Vercel serverless function at `api/analyze.ts`. The function calls Groq's API server-side — `GROQ_API_KEY` never touches the browser bundle. `groq-client.ts` and `VITE_GROQ_API_KEY` are already in the repo and just need to be wired up. This is the correct production architecture. Requires a separate implementation plan.

**This plan implements Path A** (one-line change, unblocks deployment now) and leaves Path B as the follow-up. The open questions section asks which you prefer.

---

## URL structure

Current Vite build output:
```
dist/index.html          → React app     → served at /
dist/landing/index.html  → Landing page  → served at /landing/
```

**Option 1 (no change)**: App at `/`, landing at `/landing/`. Works with zero routing config.

**Option 2 (flip)**: Landing at `/`, app at `/app`. Visitors see the landing page first; you share `/app` for demos. Requires Vercel rewrites:
```json
{ "source": "/",     "destination": "/landing/index.html" }
{ "source": "/app",  "destination": "/index.html" }
{ "source": "/app/", "destination": "/index.html" }
```

The open questions section asks which you want.

---

## Files to create/modify

| File | What changes |
|------|-------------|
| `vercel.json` | New — sets `buildCommand`, `outputDirectory`, and optionally `rewrites` for URL structure |
| `.env.example` | New — documents required env vars with placeholder values. Safe to commit. |
| `src/services/ollama-client.ts` | One-line change: `OLLAMA_BASE` reads from `import.meta.env.VITE_OLLAMA_BASE_URL` with `'http://localhost:11434'` as default |

**No changes to** `package.json`, Vite config, or any component/service logic.

---

## Test cases

Deployment config has no unit-testable logic. Verification is:

1. **Build still passes**: `npm run build` produces `dist/index.html` and `dist/landing/index.html` — already covered by existing CI.

2. **Env var fallback test** (new, in `src/services/ollama-client.test.ts`):
   ```
   it('uses VITE_OLLAMA_BASE_URL env var when set')
     → set import.meta.env.VITE_OLLAMA_BASE_URL = 'https://example.com'
     → call warmOllama() and observe the fetch URL
     → assert fetch was called with 'https://example.com/api/tags'
   ```
   This fails before the change (URL is always localhost) and passes after.

3. **Existing 105/105 tests must still pass** — the fallback default keeps local dev working.

---

## Implementation steps

1. Write the failing env var test in `ollama-client.test.ts`. Run `npm test` — confirm it fails.

2. Update `src/services/ollama-client.ts` line 4:
   ```ts
   const OLLAMA_BASE = import.meta.env.VITE_OLLAMA_BASE_URL ?? 'http://localhost:11434'
   ```
   Run `npm test` — confirm 106/106 pass.

3. Create `.env.example`:
   ```
   # Ollama base URL (default: http://localhost:11434 for local dev)
   # Set to your hosted Ollama URL for production
   VITE_OLLAMA_BASE_URL=

   # Groq API key (used by groq-client.ts — reserved for Path B migration)
   VITE_GROQ_API_KEY=
   ```

4. Create `vercel.json` based on URL structure decision (see open questions):
   ```json
   {
     "buildCommand": "npm run build",
     "outputDirectory": "dist",
     "framework": "vite"
   }
   ```
   If Option 2 (flip URLs), add `"rewrites"` array as shown above.

5. Push the unpushed landing page commit + new commits to `origin/main`:
   ```bash
   git push origin main
   ```

6. Connect to Vercel:
   - Go to vercel.com → Add New Project → Import `alcj3/GlobalQuote`
   - Vercel will detect `vercel.json` automatically
   - Add environment variables in the Vercel dashboard:
     - `VITE_OLLAMA_BASE_URL` = your hosted Ollama URL (or leave blank — app will show errors until Path B is done)
   - Deploy

7. Verify deployed URLs match expected routing. Screenshot landing page from the live URL.

---

## Out of scope

- Path B (Groq serverless function migration) — separate plan
- Custom domain setup — handled entirely in Vercel dashboard, no code changes
- CI/CD pipeline beyond Vercel's built-in git integration
- Hosting Ollama on a cloud VM — separate infrastructure concern
- Auth / access control on the app

---

## Open questions

1. **Ollama blocker**: Do you want Path A (configurable URL, app works if you host Ollama somewhere) or Path B (migrate to Groq serverless, app works on Vercel with no extra infra)? Path B is cleaner but needs a separate implementation plan first. If Path B, we should do that plan before this deployment.

2. **URL structure**: Option 1 (app at `/`, landing at `/landing/`) or Option 2 (landing at `/`, app at `/app`)? Option 2 is better UX for visitors but changes the URL you'd share for demos.

3. **Custom domain**: Do you have a domain to point at the Vercel deployment, or use the default `*.vercel.app` URL for now?
