```
   ___      _          ___ _      _
  / __| ___| |___ _ _ / __(_)_ _| |
 | (__/ _ \ / _ \ '_| \__ \ | '_| |
  \___\___/_\___/_|   |___/_|_| |_|
```

![TypeScript](https://img.shields.io/github/languages/top/latticelabs-au/colorgirl?style=flat-square&labelColor=0C1E3C&color=1E3A5F)
![Docker](https://img.shields.io/badge/runs%20in-Docker-00B4D8?style=flat-square&labelColor=0C1E3C)
![WooCommerce](https://img.shields.io/badge/exports-WooCommerce%20CSV-B8860B?style=flat-square&labelColor=0C1E3C)
![Powered by Claude](https://img.shields.io/badge/powered%20by-Claude-00B4D8?style=flat-square&labelColor=0C1E3C)

**ColorGirl**: AI-powered product scraper that converts supplier e-commerce catalogs into WooCommerce-ready CSV imports.

Because importing products shouldn't stress you out.

Point it at a supplier site. Claude analyses the structure, scrapes the products, writes descriptions and SEO, and you get a CSV you can drop straight into WooCommerce.

## Quick start

**Prerequisites:** Docker Desktop, Node.js 20+

```bash
npm install                    # first time only
./colorgirl                    # start everything, launch interactive TUI
./colorgirl --verbose          # same but see build + worker logs
./colorgirl --stop             # tear down containers
./colorgirl --rebuild          # force Docker rebuild
```

Credentials are auto-detected from your Claude Code login. If not logged in, the script prompts you to paste an API key.

```bash
# Example: scrape an entire trophy supplier catalog
./colorgirl
> Enter URL: https://trophies.com.au
```

## Pipeline

The full pipeline has 9 phases. The TUI walks you through each one, with human approval gates between major stages.

| # | Phase | What happens | Time estimate | Model |
|---|-------|-------------|---------------|-------|
| 1 | **Site Analysis** | Opus browses the supplier site, inspects HTML structure, identifies product pages, variant storage, categories, and CSS selectors. Generates a full `SiteConfig`. | 2-8 min | Opus |
| 2 | **Config Review** | TUI shows the generated config: pipeline tier, discovery strategy, categories, attributes, rate limits. You review and approve. | Manual | — |
| 3 | **Scraping** | Products scraped using the chosen pipeline tier. HTTP direct (~100/min) or sitemap+HTTP (~200/min) for most sites. Playwright (~12/min) as last resort for JS-rendered SPAs. | 1-30 min depending on site size | — |
| 4 | **Grouping** | Raw products (one per variant) consolidated into parent products. Colour/size variants merged, attributes cleaned, size labels assigned. | Seconds | — |
| 5 | **Product Review** | TUI shows all grouped products in a checkbox table. Select which ones to include in the export. | Manual | — |
| 6 | **Descriptions** | AI generates short + long product descriptions for each selected product. Batched in groups of 100. | 1-5 min | Haiku |
| 7 | **SEO** | AI generates meta title, meta description, permalink, and keywords using business config templates. Runs in parallel with descriptions. | 1-5 min | Sonnet |
| 8 | **Export Preview** | TUI shows enriched products with AI-generated content. Review before final export. | Manual | — |
| 9 | **CSV Export** | WooCommerce-compatible CSV with parent + variation rows, dynamic attribute columns, UTF-8 BOM. | Seconds | — |

**Total time for a typical supplier (200-500 products):** 10-30 minutes, most of it automated.

### Pipeline tiers (chosen by Opus during analysis)

| Tier | Transport | Speed | When |
|------|-----------|-------|------|
| **HTTP Direct** | axios + cheerio | ~100 products/min | Default. Site serves data in HTML. Category pagination. |
| **Sitemap + HTTP** | axios + cheerio | ~200 products/min | Category pages use AJAX, but product pages are static. Sitemap available. |
| **Playwright** | Chromium | ~12 products/min | Last resort. Genuine JS-rendered SPA. Very slow and resource-intensive. |

### Data flow

```
Supplier URL
     │
     ▼  Opus analyses site (2-8 min)
 SiteConfig — pipeline tier, selectors, categories, variant extraction
     │
     ▼  You review & approve
     │
     ▼  Scrape products (HTTP or Playwright)
 RawProduct[] — one per size/colour variant
     │
     ▼  Group variants into parent products
 GroupedProduct[] — parent + variations, typed simple|variable
     │
     ▼  You review & select products
     │
     ├──▶  Haiku → short + long descriptions (parallel)
     ├──▶  Sonnet → SEO metadata (parallel)
     │
     ▼  You preview enriched products
     │
     ▼  CSV Builder
 WooCommerce CSV — parent rows + variation rows + dynamic attributes
```

The whole pipeline runs on [Temporal](https://temporal.io) — if anything crashes, it picks up where it left off.

## Setup

**Prerequisites:** Docker Desktop, Node.js 20+

```bash
npm install            # install local deps (for TUI build)
./colorgirl            # does everything: Docker, Temporal, worker, TUI
```

The `./colorgirl` script handles:
- Auto-detecting credentials (Claude Code login or prompts for API key)
- Building and starting Docker containers (Temporal + PostgreSQL + worker)
- Waiting for infrastructure health
- Building the TUI and launching it
- Tearing down containers on exit

Temporal UI available at `http://localhost:8080` when running.

## Site configuration

Configs are generated automatically by the Opus agent, but you can also write them by hand. See [`configs/example.yaml`](configs/example.yaml) for the full schema.

Key concepts:

- **Pipeline tier** — `http-direct`, `sitemap-http`, or `playwright` (Opus chooses)
- **Discovery strategy** — how to find product URLs: `sitemap`, `category-list`, or `pagination`
- **Variant extraction** — how to get size/colour data: `template-tags`, `select-dropdown`, `visible-table`, `bullet-list`, or `interactive`
- **Attributes** — fully dynamic. Each has a display name, WooCommerce slug, CSS selector, and optional transform
- **Transforms** — `strip_prefix`, `reorder_colours`, `replace_slashes`, `format_number`, `colour_cleanup`

## Scripts

| Command | What it does |
|---|---|
| `./colorgirl` | Start everything and launch TUI |
| `./colorgirl -v` | Same with build + worker logs visible |
| `./colorgirl --stop` | Tear down Docker containers |
| `./colorgirl --rebuild` | Force Docker image rebuild |
| `npm test` | Run tests (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type-check without emitting |
| `npm run build` | Build to `dist/` (tsup) |

## Architecture

```
src/
├── cli/              React/Ink terminal UI
│   ├── app.tsx       Root app — screen routing + Temporal client
│   ├── screens/      One component per workflow step
│   ├── components/   Reusable: Table, ProgressBar, Checkbox, etc.
│   └── theme.ts      #a56571 brand palette
├── temporal/         Workflow orchestration
│   ├── workflows/    scrapeWorkflow — the 9-step pipeline
│   ├── activities/   6 activities: analyse, scrape, group, describe, seo, csv
│   ├── worker.ts     Worker entry point
│   └── client.ts     Temporal connection factory
├── agents/           Claude Agent SDK integration
│   ├── executor.ts   Shared query() wrapper with event parsing
│   ├── site-recon    Opus — site analysis → SiteConfig
│   ├── descriptions  Haiku — product descriptions
│   └── seo           Sonnet — SEO metadata
├── scraper/          Multi-tier scraping engine
│   ├── engine.ts     Dispatches to correct pipeline by SiteConfig.pipeline
│   ├── pipelines/    http-direct (tier 1), sitemap-http (tier 2), playwright (tier 3)
│   ├── extractors/   template-tags, select-dropdown, table, bullet-list, breadcrumb
│   ├── http-client   axios wrapper with rate limiting + cookies
│   ├── html-parser   cheerio wrapper with CSS selector API
│   └── playwright    Browser lifecycle (tier 3 only, lazy-loaded)
├── pipeline/         Data transformation
│   ├── models.ts     Core types: SiteConfig, RawProduct, GroupedProduct, EnrichedProduct
│   ├── grouper.ts    Consolidate variants into parent products
│   └── transforms    Named data cleaning functions
└── export/
    └── csv-builder   WooCommerce CSV with dynamic attribute columns
```

**Communication:** The TUI polls the Temporal workflow via **queries** (status, progress, products, logs, preview). Human approvals flow back as **signals** (config approved, products approved, export approved). The worker executes all heavy activities inside Docker.

## Tech stack

TypeScript (ESM) / Node.js 20 / Ink + React (TUI) / Temporal (orchestration) / axios + cheerio (HTTP scraping) / Playwright (tier 3 only) / Claude Agent SDK (AI agents) / csv-stringify (export) / Vitest (testing) / tsup (build)

---

Built with ❤️ and too much coffee (cold brew only).
