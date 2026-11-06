# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

ColorGirl is an AI-powered product scraper that converts supplier e-commerce catalogs into WooCommerce-compatible CSV feeds. It analyzes supplier sites, scrapes products, consolidates variants, enriches with AI-generated descriptions/SEO, and exports CSV.

## Commands

```bash
npm run build          # TSup build → dist/
npm run dev            # Run CLI (tsx, no build needed)
npm run worker         # Run Temporal worker (tsx)
npm test               # Vitest (single run)
npm run test:watch     # Vitest (watch mode)
npx vitest run src/pipeline/__tests__/grouper.test.ts   # Single test file
npm run typecheck      # tsc --noEmit
npm run docker:up      # Start Temporal + PostgreSQL + worker
npm run docker:down    # Tear down Docker stack
```

## Architecture

**Two entry points:** CLI (`src/cli/app.tsx`) and Temporal worker (`src/temporal/worker.ts`).

**Data flow through the 9-step workflow:**

1. **Site Recon** — Claude Opus analyzes a supplier URL → produces a `SiteConfig`
2. **Config Approval** — TUI presents config for human review (Temporal signal gate)
3. **Scrape** — Playwright discovers and scrapes product pages → `RawProduct[]`
4. **Group** — Consolidates color/size variants into parent products → `GroupedProduct[]`
5. **Product Approval** — TUI shows products for selection (signal gate)
6. **AI Enrichment** — Claude Haiku generates descriptions, Sonnet generates SEO metadata
7. **Merge** — Combines AI outputs with product data → `EnrichedProduct[]`
8. **Export Approval** — TUI preview (signal gate)
9. **CSV Build** — Exports to WooCommerce CSV format

**Communication pattern:** The CLI connects to a Temporal workflow via gRPC. State flows back through **Queries** (polled every 1s). Human approvals are sent via **Signals**. The task queue is `"colorgirl"`.

### Key Modules

- **`src/agents/`**: three Claude SDK agents (site-recon with Opus, descriptions with Haiku, SEO with Sonnet). All use the shared `executeAgent()` wrapper around the `@anthropic-ai/claude-agent-sdk` `query()`, typed against the types the package ships (no local shim).
- **`src/cli/`** — React/Ink terminal UI. `app.tsx` orchestrates screens; `screens/` has one component per workflow step. `theme.ts` defines colors.
- **`src/temporal/`** — `workflows/scrape-workflow.ts` is the main workflow. `activities/` has 6 activities called by the workflow. `client.ts` handles Temporal connection.
- **`src/scraper/`** — `engine.ts` drives Playwright. `strategies/` implements discovery (sitemap, category-list, pagination).
- **`src/pipeline/`** — `models.ts` defines all core types (`SiteConfig`, `RawProduct`, `GroupedProduct`, `EnrichedProduct`). `grouper.ts` consolidates variants. `transforms.ts` has named transforms (strip_prefix, reorder_colours, etc.).
- **`src/export/`** — `csv-builder.ts` generates WooCommerce CSV with parent + variation rows.

### Type Hierarchy

`RawProduct` → (grouper) → `GroupedProduct` → (enrichment) → `EnrichedProduct`

`SiteConfig` drives scraping behavior: discovery strategy, CSS selectors, variant strategy, attribute definitions, rate limiting.

## Testing

Vitest with `globals: true` and Node environment. The `@anthropic-ai/claude-agent-sdk` import is aliased to an inert stub in `vitest.config.ts` so no test can reach the real SDK (which spawns the Claude Code CLI); tests then replace it with `vi.mock()`. Tests mock Playwright browsers via `vi.mock()`.

## Build

TSup bundles two entry points (`src/cli/app.tsx`, `src/temporal/worker.ts`) to ESM targeting Node 20. The `colorgirl` bin points to `dist/cli/app.js`. TypeScript is strict mode with `react-jsx` transform.
