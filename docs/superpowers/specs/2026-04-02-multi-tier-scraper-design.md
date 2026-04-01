# Multi-Tier HTTP-First Scraper Refactor

## Problem

The current scraper uses Playwright (full browser automation) for all sites. This is slow (~12 products/min), resource-heavy, fragile to bot detection, and unnecessary — the OG `trophy-scraper` proves that most supplier sites serve all product and variant data in the initial HTML response. Playwright should be a last resort, not the default.

## Solution

Replace the Playwright-first scraper with a three-tier pipeline. Opus recon determines which tier to use. HTTP is default, Playwright is the nuclear option.

### Tier Model

| Tier | Transport | Discovery | Speed | When |
|------|-----------|-----------|-------|------|
| 1. HTTP Direct | axios | Category pagination | ~100 products/min | Site serves product data in HTML, clear category nav |
| 2. Sitemap + HTTP | axios | sitemap.xml | ~200 products/min | Category pages use AJAX/infinite scroll, but product pages are static HTML |
| 3. Playwright | Chromium | Browser navigation | ~12 products/min | Genuinely JS-rendered SPA. Last resort. Very token/resource intensive. |

Opus strongly prefers tier 1, falls back to tier 2 if category pages are broken, and only recommends tier 3 when the site is genuinely client-rendered.

## SiteConfig Schema Changes

### New Fields

```ts
interface SiteConfig {
  // ... existing fields (name, baseUrl, discovery, selectors, attributes, rateLimit, variants, categoryMap, skipCategories)

  /** Which scraping tier to use */
  pipeline: "http-direct" | "sitemap-http" | "playwright";

  /** How to extract variant data from product pages */
  variantExtraction: VariantExtraction;
}
```

### VariantExtraction (new discriminated union)

```ts
interface TemplateTagExtraction {
  method: "template-tags";
  /** CSS selector or regex for template elements, e.g. "template[data-temp-id]" */
  templateSelector: string;
  /** Attribute containing the variant SKU, e.g. "data-temp-id" */
  skuAttribute: string;
  /** How to parse inner HTML of each template */
  innerFormat: "table" | "list";
}

interface SelectDropdownExtraction {
  method: "select-dropdown";
  /** CSS selector for the dropdown, e.g. "select.jsVariationDropdown" */
  dropdownSelector: string;
  /** How to derive variant SKUs from dropdown options */
  skuInference: "increment-last-letter" | "from-option-value" | "from-option-data";
}

interface VisibleTableExtraction {
  method: "visible-table";
  /** CSS selector for the product data table */
  tableSelector: string;
}

interface BulletListExtraction {
  method: "bullet-list";
  /** CSS selector for list items containing attributes */
  listSelector: string;
  /** Known attribute keys to extract (e.g. ["Colour", "Material", "Weight(g)"]) */
  knownKeys: string[];
}

interface InteractiveExtraction {
  method: "interactive";
  /** Playwright interaction steps to reveal variant data */
  steps: Array<{
    action: "click" | "select" | "wait";
    selector: string;
    value?: string;
    waitFor?: string;
  }>;
}

type VariantExtraction =
  | TemplateTagExtraction
  | SelectDropdownExtraction
  | VisibleTableExtraction
  | BulletListExtraction
  | InteractiveExtraction;
```

## New Dependencies

| Package | Purpose | Replaces |
|---------|---------|----------|
| `axios` | HTTP client with cookie jar, proxy support | Playwright for HTTP requests |
| `cheerio` | HTML parsing with CSS selectors (Node's BeautifulSoup) | Playwright's `page.$eval()` |

`playwright` becomes an optional dependency — only needed for tier 3.

## Module Structure

```
src/scraper/
├── http-client.ts          axios instance factory
│                           - cookie jar (axios-cookiejar-support + tough-cookie)
│                           - configurable rate limiting (delay between requests)
│                           - User-Agent header
│                           - optional proxy
│                           - timeout (30s default)
│
├── html-parser.ts          cheerio wrapper
│                           - load HTML → cheerio instance
│                           - textContent(selector) → string
│                           - optionalText(selector) → string | undefined
│                           - optionalNumber(selector) → number | undefined
│                           - allText(selector) → string[]
│                           - allHrefs(selector) → string[]
│                           - exists(selector) → boolean
│
├── pipelines/
│   ├── http-direct.ts      Tier 1: HTTP Direct
│   │                       - Paginate category pages (URL-based: ?page=N, ?pgnum=N)
│   │                       - Collect product URLs from category page links
│   │                       - Fetch each product page with rate limiting
│   │                       - Extract product data using selectors + variantExtraction
│   │                       - Return RawProduct[]
│   │
│   ├── sitemap-http.ts     Tier 2: Sitemap + HTTP
│   │                       - Fetch sitemap.xml (handle .gz compressed)
│   │                       - Extract all <loc> URLs, filter to products
│   │                       - Fetch each product page with rate limiting
│   │                       - Extract product data using selectors + variantExtraction
│   │                       - Match categories post-hoc from breadcrumbs
│   │                       - Return RawProduct[]
│   │
│   └── playwright.ts       Tier 3: Playwright (last resort)
│                           - Current BrowserManager code, trimmed
│                           - InteractiveExtraction steps: click, select, wait
│                           - Heavily checkpointed per product page
│                           - Return RawProduct[]
│
├── extractors/
│   ├── template-tags.ts    Extract variants from <template> tags
│   │                       - Regex to find template elements with SKU attribute
│   │                       - Parse inner HTML with cheerio
│   │                       - Return variant SKU + parsed data per template
│   │
│   ├── select-dropdown.ts  Extract variants from <select> options
│   │                       - Parse option values and text
│   │                       - SKU inference: increment-last-letter (A→B→C),
│   │                         from-option-value, from-option-data
│   │                       - Return variant SKU + size/attribute data per option
│   │
│   ├── table-parser.ts     Extract key-value data from HTML tables
│   │                       - Find <table>, iterate <tr>/<td> pairs
│   │                       - Return Record<string, string>
│   │
│   ├── bullet-list.ts      Extract attributes from <li> elements
│   │                       - Parse "Key: Value" patterns from list items
│   │                       - Filter to knownKeys from config
│   │                       - Return Record<string, string>
│   │
│   └── breadcrumb.ts       Extract category path from breadcrumb nav
│                           - Parse breadcrumb links/text
│                           - Return string[] category path
│
├── engine.ts               Orchestrator
│                           - Reads SiteConfig.pipeline → dispatches to pipeline
│                           - Uniform scrape() interface returning ScrapeResult
│                           - Progress callbacks
│                           - Error collection
│
└── playwright.ts           BrowserManager (kept, only imported by tier 3)
```

## Pipeline Execution Detail

### Tier 1: HTTP Direct

```
For each category in SiteConfig.discovery.sections:
  page = 1
  loop:
    fetch category URL with ?page=N (or site's pagination param)
    parse HTML with cheerio
    extract product links matching baseUrl
    if no new links: break
    page++
    rate limit delay

  for each product URL:
    fetch product page
    parse with cheerio using SiteConfig.selectors (name, sku, images, price, etc.)
    apply variantExtraction method:
      template-tags → regex extract templates, parse inner HTML per variant
      select-dropdown → parse options, infer SKUs
      visible-table → parse single table
      bullet-list → parse li elements
    yield RawProduct per variant
    rate limit delay
```

### Tier 2: Sitemap + HTTP

```
fetch sitemap.xml (or sitemap.xml.gz)
extract all <loc> URLs
filter to product URLs (using SiteConfig.discovery.filterPatterns or path heuristics)

for each product URL:
  fetch product page
  parse with cheerio using SiteConfig.selectors
  apply variantExtraction method (same extractors as tier 1)
  extract category from breadcrumbs (post-hoc)
  yield RawProduct per variant
  rate limit delay
```

### Tier 3: Playwright

```
launch browser (headless Chromium, stealth flags)

for each product URL (discovered via browser navigation or sitemap):
  navigate to URL, wait for load
  if variantExtraction.method == "interactive":
    execute steps: click swatches, wait for AJAX, select dropdowns
  extract data from rendered DOM
  yield RawProduct per variant
  CHECKPOINT to Temporal after each product (2-5s per page, crashes likely)
  rate limit delay

close browser
```

## Opus Recon Prompt Expansion

The site-recon agent prompt is expanded to instruct Opus to:

1. **Check for sitemap** — visit `/sitemap.xml`, `/sitemap_index.xml`, `/sitemap.xml.gz`
2. **Inspect variant storage** — look at product page source HTML (not rendered) for:
   - `<template>` tags with variant data embedded
   - `<select>` dropdowns with size/colour options
   - Visible tables with product specs
   - Bullet lists with attribute key:value pairs
   - Whether changing variants triggers AJAX or page navigation
3. **Determine cheapest pipeline** — prefer http-direct, fall back to sitemap-http, only recommend playwright if the site is genuinely JS-rendered
4. **Populate `variantExtraction`** with the specific selectors, attributes, and inference methods for the site
5. **Populate `pipeline`** field

The prompt emphasizes that Playwright is extremely expensive and should only be recommended when HTTP approaches are genuinely impossible.

## Temporal Checkpointing

- **Tiers 1 & 2:** Checkpoint per category batch (existing pattern). Each `scrapeCategoryActivity` call is one Temporal activity. If it fails, Temporal retries that category only.
- **Tier 3:** Checkpoint per individual product page. The activity accepts a batch of URLs and reports progress per-URL. On retry, it skips already-completed URLs using workflow state.

## What Stays Unchanged

- `src/pipeline/` — models (except SiteConfig additions), grouper, transforms
- `src/export/` — CSV builder
- `src/agents/descriptions.ts`, `src/agents/seo.ts` — AI enrichment agents
- `src/cli/` — TUI screens (pipeline choice visible in config review)
- `src/temporal/workflows/scrape-workflow.ts` — workflow structure stays, `scrapeCategoryActivity` internally dispatches to the right pipeline
- `src/temporal/activities/` — activity wrappers stay, internal implementation changes

## Test Strategy

- **Extractor unit tests:** Each extractor tested with HTML fixture strings (cheerio loaded from static HTML). No network.
- **Pipeline unit tests:** Each pipeline tested with mocked axios responses. Verify URL discovery, product extraction, rate limiting.
- **HTTP client tests:** Verify rate limiting, cookie persistence, error handling.
- **Engine integration tests:** Verify SiteConfig.pipeline routing to correct pipeline.
- **Existing tests:** Pipeline (grouper, transforms), CSV builder, workflow, CLI tests stay unchanged.
- **Playwright tier tests:** Keep existing mocked Playwright test pattern for tier 3.
