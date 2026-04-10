# Trophy-Scraper Feature Allocation

**Date:** 2026-04-10
**Status:** Approved

## Context

Trophy-scraper (`C:\Users\A\PycharmProjects\trophy-scraper`) is a Python-based, production-grade WooCommerce pipeline specialized for trophy/award suppliers. It has accumulated many features beyond what colorgirl (the generalized TypeScript scraper) currently supports.

This spec allocates trophy-scraper's new features between:
- **colorgirl** (open-source core) — CLI scrape-to-CSV, BYOK API keys, self-hosted
- **colorgirl-saas** — WooCommerce push, web dashboard, scheduled syncs, managed AI, image CDN

The allocation follows the SaaS strategy at `colorgirl-saas/docs/saas-strategy.md`.

## Decisions

- **Self-hosted ML (Ollama/Qwen):** SaaS-only, per strategy. Preserves the conversion funnel.
- **Template-based SEO:** SaaS-only. Open-source stays Sonnet-only.
- **WordPress plugins, audit tools, image pipeline, WC API push:** All SaaS.

---

## colorgirl (Core) — 5 Features

These are pure scraping/transformation improvements to the open-source CSV pipeline.

### 1. Split Group Detection
- **Source:** `trophy-scraper/scraper/grouper.py`
- **Target:** `src/pipeline/grouper.ts`
- **What:** When products grouped by base name have wildly inconsistent attributes (different material, vastly different sizes), sub-group them by parent SKU instead of merging incorrectly.
- **Why:** Prevents bad variant grouping that produces incorrect CSV rows.

### 2. Parent SKU Selection (Lowest Alphabetically)
- **Source:** `trophy-scraper/scraper/grouper.py`
- **Target:** `src/pipeline/grouper.ts`
- **What:** When selecting the parent SKU for a grouped product, consistently pick the lowest alphanumeric SKU rather than the first encountered.
- **Why:** Deterministic, stable parent SKU assignment across runs.

### 3. CSV Audit Validation
- **Source:** `trophy-scraper/audit.py`
- **Target:** New file `src/export/csv-audit.ts`
- **What:** Post-export validation that checks: correct column count (matches header), no orphan variations (every variation's parent SKU exists as a parent row), no duplicate SKUs, required fields populated.
- **Why:** Core outputs CSV — core should catch structural errors before the user imports.

### 4. Improved Colour Cleanup Transform
- **Source:** `trophy-scraper/scraper/transforms.py: clean_colour()`
- **Target:** `src/pipeline/transforms.ts`
- **What:** Extend the existing `stripPrefix` transform with colour-specific logic: remove "Antique" prefix from colour names (e.g., "Antique Gold" -> "Gold"), standardize compound colour formats.
- **Why:** Better colour normalization for the grouper and CSV output.

### 5. Number/Unit Formatting
- **Source:** `trophy-scraper/scraper/transforms.py: format_number(), strip_units()`
- **Target:** `src/pipeline/transforms.ts`
- **What:** Strip unit suffixes (g, mm, cm) from numeric attribute values and format as clean integers (no decimals for whole numbers). Add a `strip_units` named transform.
- **Why:** Cleaner attribute values in CSV, especially for weight/height/width.

---

## colorgirl-saas — 25 Features (5 Capability Areas)

### A. WooCommerce Integration Layer

#### A1. WC REST API Client
- **Source:** `trophy-scraper/wc_client.py`
- **Port to:** TypeScript module in colorgirl-saas
- **What:** HTTP wrapper with exponential backoff retry (1s, 3s, 9s), retries on 5xx/429/transport errors, fast-fails on other 4xx. `safeJson()` parser handles PHP warnings prepended to JSON responses.
- **Auth:** WooCommerce consumer key/secret (query string auth).

#### A2. WordPress REST API Client
- **Source:** `trophy-scraper/wc_client.py: WPClient`
- **Port to:** TypeScript module in colorgirl-saas
- **What:** WordPress REST API client with app password auth. Used for media uploads and direct resource access.

#### A3. Product Uploader
- **Source:** `trophy-scraper/uploader/products.py`
- **Port to:** TypeScript activity in colorgirl-saas
- **What:** Creates WC products via REST API. Builds attribute arrays (Size, Colour, Material, etc. by ID), creates parent products (type "variable"), creates variation products (child type with per-variant dimensions). Post-upload audit validates parent/variation structure.
- **Maps to SaaS strategy:** "REST push to WooCommerce (no CSV step)"

#### A4. Category Manager
- **Source:** `trophy-scraper/uploader/categories.py`
- **Port to:** TypeScript module in colorgirl-saas
- **What:** Slug-based category cache, lazy-loads existing WC categories, auto-creates missing ones. Supports parent category hierarchy. Batch operations with pagination (100 per page).

#### A5. Colour Swatches Handler
- **Source:** `trophy-scraper/uploader/swatches.py`
- **Port to:** TypeScript module in colorgirl-saas
- **What:** CartFlows Variation Swatches plugin integration. 25+ colour-to-hex mappings, compound colour support (e.g., "Black / Gold" uses first colour's hex). Sets `cfvsw_image` in wp_termmeta via direct DB write.
- **Note:** May need MySQL client dependency or WC REST alternative.

#### A6. AIOSEO Integration
- **Source:** `trophy-scraper/uploader/aioseo.py`
- **Port to:** TypeScript module in colorgirl-saas
- **What:** Direct MySQL writes to `wp_aioseo_posts` table. Keyphrase analysis, smart meta title/description truncation (word-boundary breaking, stop-word stripping), page score calculation.

### B. Image Pipeline

#### B1. Image Processor
- **Source:** `trophy-scraper/images/processor.py`
- **Port to:** TypeScript module in colorgirl-saas
- **What:** Download images via HTTP, detect background colour (white/grey/other via corner sampling), pad to square with detected background fill, convert to WebP with quality stepping (85 down to 50) to hit 150KB target.
- **Maps to SaaS strategy:** "Image CDN + WebP pipeline"

#### B2. Composite Image Generator
- **Source:** `trophy-scraper/images/composite.py`
- **Port to:** TypeScript module in colorgirl-saas
- **What:** Generates size-comparison composite images (1200x1200px canvas). Vertical ruler overlay with mm scale, trophies side-by-side baseline-aligned, bottom labels ("S (155 mm)"). White background removal (near-white -> transparent).
- **Dependency:** Sharp or canvas library for Node.js image manipulation.

#### B3. WordPress Media Uploader
- **Source:** `trophy-scraper/images/uploader.py`
- **Port to:** TypeScript module in colorgirl-saas (uses A2 WP client)
- **What:** Multipart form upload to `/wp-json/wp/v2/media`. Auto-generates alt text: "{product-name} -- {size} {colour}". Inherits retry logic from WP client.

#### B4. Image Manifest & Tracking
- **Source:** `trophy-scraper/images/__init__.py`
- **Port to:** TypeScript module in colorgirl-saas
- **What:** SKU-to-image-URL mapping manifest. Batch processing with chunking. Resume logic (skip already-processed SKUs). Per-SKU progress logging.

### C. AI / Descriptions

#### C1. Self-Hosted ML Descriptions (Ollama/Qwen)
- **Source:** `trophy-scraper/gen_descriptions.py`
- **Port to:** TypeScript agent alternative in colorgirl-saas
- **What:** Hybrid assembly: ML writes creative lines (short_description, line1, line3, meta_sentence1), factual lines injected programmatically. Validates 4-key JSON output, retries on failure. Fallback to deterministic template generation.
- **Maps to SaaS strategy:** "Self-hosted Qwen/Llama (nearly free)" for Haiku tier.
- **Model:** Qwen 3 8B or equivalent via Ollama API.

#### C2. Template-Based SEO
- **Source:** `trophy-scraper/scraper/seo.py`
- **Port to:** TypeScript module in colorgirl-saas
- **What:** Deterministic SEO without AI calls. `generateKeywords()` derives from category, `generateMetaTitle()` uses "[Keyword] [Business] | [Product Name]" in title case, `generatePermalink()` produces lowercase hyphenated slug with keyword.
- **Use case:** Bulk products where Sonnet cost isn't justified.

### D. Operations & Maintenance

#### D1. Pipeline Daemon / Sync Scheduler
- **Source:** `trophy-scraper/pipeline_daemon.py`
- **Port to:** Temporal ContinueAsNew loop in colorgirl-saas
- **What:** Continuous monitoring of enrichment progress, auto-restart logic, completion detection. In SaaS context, this becomes the scheduled re-scrape + diff + push cycle.
- **Maps to SaaS strategy:** "Scheduled re-scrapes (Temporal cron workflows)"

#### D2. Store Validation Audit
- **Source:** `trophy-scraper/validate_store.py`
- **Port to:** TypeScript tool in colorgirl-saas
- **What:** Spot-checks WC product structure post-upload. Validates SKUs exist, attributes correct, parent-child relationships intact.

#### D3. Variation Audit
- **Source:** `trophy-scraper/audit_variations.py`
- **Port to:** TypeScript tool in colorgirl-saas
- **What:** Verifies parent-child variation relationships in WC. Detects orphaned variations, missing parents, attribute mismatches.

#### D4. Image Rename/Repair Tools
- **Source:** `trophy-scraper/image_rename/` (8 tools)
- **Port to:** TypeScript utilities in colorgirl-saas
- **What:** Manifest generator (attachment ID -> on-disk path), rename engine (slug-based names + DB update), sync between servers, dup source resolver, broken reupload, validation schema.

#### D5. Data Fix Scripts
- **Source:** `trophy-scraper/fix_categories.py`, `fix_colour_cleanup.py`, `fix_colour_terms.py`, `fix_plate_data.py`, `fix_data_quality.py`, `delete_composites.py`, `delete_orphan_uploads.py`, `fix_broken_rtwpvg.py`
- **Port to:** TypeScript maintenance tools in colorgirl-saas
- **What:** Category correction, colour standardization, engraving plate formatting, data quality pipeline, composite cleanup, orphan attachment removal, RTWPVG gallery plugin fixes.

### E. WordPress Plugins

#### E1. RTWPVG Colour Switch
- **Source:** `trophy-scraper/wp-plugins/rtwpvg-colour-switch.php`
- **What:** Custom colour attribute swatch display for WC product pages. JavaScript injection handles frontend swatch rendering.
- **Deploy:** Ship as a bundled WP plugin with SaaS onboarding.

#### E2. SST Variation Dimensions
- **Source:** `trophy-scraper/wp-plugins/sst-variation-dimensions.php`
- **What:** Displays weight/height/width per variation on product pages.
- **Deploy:** Ship as a bundled WP plugin with SaaS onboarding.

#### E3. Session Logger
- **Source:** `trophy-scraper/wp-plugins/ee-session-log.php`
- **What:** Logs user sessions for debugging store issues.
- **Deploy:** Ship as a bundled WP plugin with SaaS onboarding.

---

## Implementation Notes

### Python -> TypeScript Porting
All trophy-scraper features are Python. Both colorgirl and colorgirl-saas are TypeScript/Node.js. Every feature requires a port, not a direct copy. Key considerations:
- **Image processing:** Python uses Pillow; TypeScript equivalent is Sharp (libvips bindings)
- **HTTP clients:** Python uses httpx/aiohttp; TypeScript uses axios (already in colorgirl)
- **MySQL direct access:** Python uses mysql-connector; TypeScript equivalent is mysql2 or pg
- **HTML parsing:** Python uses BeautifulSoup; TypeScript uses cheerio (already in colorgirl)

### Dependency on Core
SaaS features A3 (Product Uploader), C1 (ML Descriptions), C2 (Template SEO) depend on colorgirl's type system (`GroupedProduct`, `EnrichedProduct`, `SiteConfig`). The SaaS layer imports these types from the core package.

### Feature Priority (Suggested)
1. **WC Integration Layer (A1-A4)** — This is the "REST push" that replaces CSV. Core SaaS value.
2. **Image Pipeline (B1-B3)** — Image CDN is the second pillar of the SaaS strategy.
3. **Self-Hosted ML (C1)** — Cost optimization that makes the SaaS margin work.
4. **Sync/Daemon (D1)** — "The sync sells the subscription."
5. **Everything else** — Swatches, AIOSEO, audits, plugins, fixes — operational polish.

### Core Features (colorgirl) Priority
All 5 core features can be implemented in a single PR. They're small, isolated changes to `grouper.ts`, `transforms.ts`, and a new `csv-audit.ts`.
