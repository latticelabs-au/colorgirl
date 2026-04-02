```
   ___      _          ___ _      _
  / __| ___| |___ _ _ / __(_)_ _| |
 | (__/ _ \ / _ \ '_| \__ \ | '_| |
  \___\___/_\___/_|   |___/_|_| |_|
```

AI-powered product scraper that converts supplier e-commerce catalogs into WooCommerce-ready CSV imports.

Point it at a supplier site. Claude analyses the structure, scrapes the products (HTTP-first, Playwright as last resort), Claude writes descriptions and SEO, and you get a CSV you can drop straight into WooCommerce.

## Quick start

**Prerequisites:** Docker Desktop, Node.js 20+

```bash
./colorgirl                    # start everything, launch interactive TUI
./colorgirl --verbose          # same but see Opus/worker logs
./colorgirl --stop             # tear down containers
./colorgirl --rebuild          # force Docker rebuild
```

Credentials are auto-read from `~/.claude/.credentials.json` (Claude Code login). Or set `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` manually.

## How it works

```
Supplier URL
     │
     ▼  Claude Opus analyses site
 SiteConfig (selectors, categories, attributes)
     │
     ▼  You review & approve in the TUI
     │
     ▼  HTTP scrapes product pages (Playwright as last resort)
 RawProduct[] (one per variant)
     │
     ▼  Grouper consolidates variants
 GroupedProduct[] (parent + variations)
     │
     ▼  You review & select products in the TUI
     │
     ├──▶  Claude Haiku → descriptions (short + long)
     ├──▶  Claude Sonnet → SEO (meta title, meta desc, permalink, keywords)
     │
     ▼  You preview & approve
     │
     ▼  CSV Builder
 WooCommerce CSV
```

The whole pipeline runs on [Temporal](https://temporal.io) — if anything crashes, it picks up where it left off.

## Setup

**Prerequisites:** Docker Desktop, Node.js 20+

```bash
npm install            # install local deps (for TUI build)
./colorgirl            # does everything: Docker, Temporal, worker, TUI
```

Temporal UI available at `http://localhost:8080` when running.

The TUI walks you through:

1. **Paste a supplier URL** — Opus analyses the site and generates a scraping config
2. **Review the config** — categories, attributes, rate limits
3. **Watch the scrape** — live progress per category
4. **Select products** — checkbox table of everything found
5. **AI enrichment** — descriptions and SEO generated in parallel
6. **Preview & export** — review enriched products, export to CSV

## Site configuration

Configs are generated automatically by the Opus agent, but you can also write them by hand. See [`configs/example.yaml`](configs/example.yaml) for the full schema.

Key concepts:

- **Discovery strategy** — how to find product URLs: `sitemap`, `category-list`, or `pagination`
- **Variant strategy** — how colour/size variants are structured: `same-page`, `separate-pages`, or `ajax-dropdown`
- **Attributes** — fully dynamic. Each attribute has a display name, WooCommerce slug, CSS selector, and optional transform
- **Transforms** — `strip_prefix`, `reorder_colours`, `replace_slashes`, `format_number`, `colour_cleanup`

## Scripts

| Command | What it does |
|---|---|
| `./colorgirl` | Start everything and launch TUI |
| `./colorgirl -v` | Same with worker/Opus logs visible |
| `./colorgirl --stop` | Tear down Docker containers |
| `npm test` | Run tests (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type-check without emitting |
| `npm run build` | Build to `dist/` (tsup) |

## Architecture

```
src/
├── cli/            React/Ink terminal UI
│   ├── app.tsx     Root app — screen routing + Temporal client
│   ├── screens/    One component per workflow step
│   ├── components/ Reusable: Table, ProgressBar, Checkbox, etc.
│   └── theme.ts    #a56571 brand palette
├── temporal/       Workflow orchestration
│   ├── workflows/  scrapeWorkflow — the 9-step pipeline
│   ├── activities/ 6 activities: analyse, scrape, group, describe, seo, csv
│   ├── worker.ts   Worker entry point
│   └── client.ts   Temporal connection factory
├── agents/         Claude SDK integration
│   ├── executor.ts Shared wrapper around @anthropic-ai/claude-code query()
│   ├── site-recon   Opus — site analysis → SiteConfig
│   ├── descriptions Haiku — product descriptions
│   └── seo          Sonnet — SEO metadata
├── scraper/        Playwright-based scraping
│   ├── engine.ts   Scrape orchestrator with retry + rate limiting
│   ├── playwright   Browser lifecycle management
│   └── strategies/  URL discovery (sitemap, category-list, pagination)
├── pipeline/       Data transformation
│   ├── models.ts   Core types: SiteConfig, RawProduct, GroupedProduct, EnrichedProduct
│   ├── grouper.ts  Consolidate variants into parent products
│   └── transforms  Named data cleaning functions
└── export/
    └── csv-builder WooCommerce CSV generation with dynamic attribute columns
```

**Communication pattern:** The CLI polls the Temporal workflow via **queries** (status, progress, products, preview). Human approvals flow back as **signals** (config approved, products approved, export approved). The worker executes all heavy activities (scraping, AI calls, CSV writing).

## Tech stack

TypeScript (ESM) / Node.js 20 / Ink + React (TUI) / Temporal (orchestration) / Playwright (scraping) / Claude Code SDK (AI agents) / csv-stringify (export) / Vitest (testing) / tsup (build)
