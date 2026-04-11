# QuoteFlow MVP

Small business quoting/estimation tool — helping tradespeople price jobs accurately.

## Stack

- Frontend: React + Vite
- Backend: Python / FastAPI
- Database: Postgres
- Deployment: Vercel

See @README.md for project overview and @package.json for available scripts.

## Build & Run

```bash
npm install          # install deps
npm run dev          # start dev server
npm run build        # production build
npm run test         # run test suite
npm run test:watch   # run tests in watch mode
npm run lint         # lint all files
```

## Workflow — IMPORTANT

YOU MUST follow this sequence for every feature or fix:

1. **Research**: Read relevant files first. Understand existing patterns before changing anything.
2. **Plan**: Write a plan to `docs/plans/<feature-name>.md`. List exactly which files you will create/modify and what each change does. Wait for my approval before implementing.
3. **Test first (TDD)**: Write failing tests that define the expected behavior. Run them — they must fail.
4. **Implement**: Write the minimum code to make tests pass.
5. **Verify**: Run the full test suite. Run the linter. Fix any issues.
6. **Commit**: One logical commit per change with a descriptive message.

Do NOT skip the plan step. Do NOT implement without my explicit approval of the plan.

## Code Principles

- **KISS**: Choose the simplest solution that works. No premature abstractions.
- **SOLID**: Single responsibility per module. Depend on abstractions, not concretions.
- **Small functions**: Each function does one thing. If it needs a comment explaining what it does, it's too complex — refactor.
- **No dead code**: Don't leave commented-out code, unused imports, or placeholder TODOs in committed code.

## Code Style

- ES modules (`import`/`export`), never CommonJS (`require`)
- Functional components with hooks (no class components)
- Destructure imports: `import { useState } from 'react'`
- Name files in kebab-case: `quote-builder.tsx`, `pricing-utils.ts`
- Colocate tests: `quote-builder.test.tsx` next to `quote-builder.tsx`

## Scope Boundaries — IMPORTANT

You MAY freely modify:
- `src/` — application source code
- `tests/` — test files
- `docs/plans/` — implementation plans

You MUST ask before modifying:
- `package.json` (dependency changes)
- Database schemas or migrations
- CI/CD configuration
- Environment variables or `.env` files

You must NEVER modify:
- `.git/` or git history (no force pushes, no rebase)
- `node_modules/`
- Files outside this project directory

## Testing

- Use Vitest for unit/integration tests
- Every new module needs a corresponding test file
- Test behavior, not implementation details
- Mock external services (APIs, databases) at the boundary
- Aim for tests that read like specs: `it('calculates total with tax for a landscaping quote')`

## Architecture Notes

- Keep API routes thin — business logic lives in service modules under `src/services/`
- Validation happens at the API boundary using schemas
- Frontend state: start with React state + context. No state library until we genuinely need one.
- Error handling: throw typed errors in services, catch and format in route handlers
