# Multi-Tier HTTP-First Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Playwright-first scraper with a three-tier pipeline (HTTP direct → sitemap+HTTP → Playwright) where Opus recon determines the cheapest viable tier per supplier site.

**Architecture:** New `axios` + `cheerio` HTTP scraping core with composable extractors for variant data (template tags, select dropdowns, tables, bullet lists). Playwright stays as tier 3 for genuine SPAs. Engine dispatches to the correct pipeline based on `SiteConfig.pipeline`. Existing downstream pipeline (grouper, transforms, CSV, enrichment) stays unchanged.

**Tech Stack:** TypeScript ESM, axios (HTTP + cookies), cheerio (HTML parsing), Playwright (tier 3 only), vitest (testing)

**Spec:** `docs/superpowers/specs/2026-04-02-multi-tier-scraper-design.md`

---

### Task 1: Add New Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install axios and cheerio**

```bash
npm install axios cheerio
```

- [ ] **Step 2: Verify install**

```bash
npm ls axios cheerio
```

Expected: both packages listed with versions

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add axios and cheerio dependencies for HTTP-first scraping"
```

---

### Task 2: Add Types to models.ts

**Files:**
- Modify: `src/pipeline/models.ts`
- Test: existing tests still pass (no new test file needed — these are type additions)

- [ ] **Step 1: Add VariantExtraction discriminated union and pipeline field to models.ts**

Add after the `VariantStrategy` type and before `AttributeDef`:

```ts
// ---------------------------------------------------------------------------
// Variant extraction strategies (how to extract variant data from HTML)
// ---------------------------------------------------------------------------

export interface TemplateTagExtraction {
  method: "template-tags";
  /** CSS selector or regex for template elements, e.g. "template[data-temp-id]" */
  templateSelector: string;
  /** Attribute containing the variant SKU, e.g. "data-temp-id" */
  skuAttribute: string;
  /** How to parse inner HTML of each template */
  innerFormat: "table" | "list";
}

export interface SelectDropdownExtraction {
  method: "select-dropdown";
  /** CSS selector for the dropdown, e.g. "select.jsVariationDropdown" */
  dropdownSelector: string;
  /** How to derive variant SKUs from dropdown options */
  skuInference: "increment-last-letter" | "from-option-value" | "from-option-data";
}

export interface VisibleTableExtraction {
  method: "visible-table";
  /** CSS selector for the product data table */
  tableSelector: string;
}

export interface BulletListExtraction {
  method: "bullet-list";
  /** CSS selector for list items containing attributes */
  listSelector: string;
  /** Known attribute keys to extract (e.g. ["Colour", "Material", "Weight(g)"]) */
  knownKeys: string[];
}

export interface InteractiveExtraction {
  method: "interactive";
  /** Playwright interaction steps to reveal variant data */
  steps: Array<{
    action: "click" | "select" | "wait";
    selector: string;
    value?: string;
    waitFor?: string;
  }>;
}

export type VariantExtraction =
  | TemplateTagExtraction
  | SelectDropdownExtraction
  | VisibleTableExtraction
  | BulletListExtraction
  | InteractiveExtraction;
```

Add `pipeline` and `variantExtraction` fields to the `SiteConfig` interface:

```ts
export interface SiteConfig {
  // ... existing fields ...

  /** Which scraping pipeline tier to use */
  pipeline: "http-direct" | "sitemap-http" | "playwright";
  /** How to extract variant data from product pages */
  variantExtraction: VariantExtraction;
}
```

- [ ] **Step 2: Run all tests to verify nothing breaks**

```bash
npx vitest run
```

Expected: All 363 tests pass. Existing code that creates `SiteConfig` objects in tests will need the new fields — if TypeScript complains, update `makeConfig()` in test helpers to include defaults: `pipeline: "http-direct"` and `variantExtraction: { method: "visible-table", tableSelector: "table" }`.

- [ ] **Step 3: Update test helpers that construct SiteConfig**

In `src/scraper/__tests__/engine.test.ts`, update `makeConfig()`:

```ts
function makeConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    name: "test-site",
    baseUrl: "https://example.com",
    discovery: { type: "sitemap", url: "https://example.com/sitemap.xml", filterPatterns: [] },
    selectors: {
      name: ".product-name",
      sku: ".product-sku",
      images: ".product-image img",
    },
    attributes: [],
    rateLimit: 0,
    variants: { type: "same-page" },
    pipeline: "http-direct",
    variantExtraction: { method: "visible-table", tableSelector: "table" },
    ...overrides,
  };
}
```

Check all other test files that construct `SiteConfig` objects and add the same defaults. Files to check:
- `src/temporal/__tests__/workflow.test.ts`
- `src/agents/__tests__/agents.test.ts`
- `src/cli/__tests__/screens.test.tsx`

- [ ] **Step 4: Run all tests again**

```bash
npx vitest run
```

Expected: All 363 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/models.ts src/scraper/__tests__/engine.test.ts src/temporal/__tests__/workflow.test.ts src/agents/__tests__/agents.test.ts src/cli/__tests__/screens.test.tsx
git commit -m "Add VariantExtraction types and pipeline field to SiteConfig"
```

---

### Task 3: HTTP Client (axios wrapper)

**Files:**
- Create: `src/scraper/http-client.ts`
- Create: `src/scraper/__tests__/http-client.test.ts`

- [ ] **Step 1: Write failing tests for HttpClient**

```ts
// src/scraper/__tests__/http-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// We'll mock axios at the module level
vi.mock("axios", () => {
  const mockAxios = {
    get: vi.fn(),
    defaults: { headers: { common: {} } },
  };
  return {
    default: { create: vi.fn().mockReturnValue(mockAxios), isAxiosError: vi.fn() },
  };
});

import { createHttpClient, type HttpClientOptions } from "../http-client.js";

describe("createHttpClient", () => {
  it("returns an object with get and getRaw methods", () => {
    const client = createHttpClient({ rateLimit: 0 });
    expect(client.get).toBeDefined();
    expect(client.getRaw).toBeDefined();
  });
});

describe("HttpClient.get", () => {
  it("fetches a URL and returns the HTML body as a string", async () => {
    const axios = (await import("axios")).default;
    const mockInstance = axios.create();
    (mockInstance.get as any).mockResolvedValue({ data: "<html><body>Hello</body></html>", status: 200 });

    const client = createHttpClient({ rateLimit: 0 });
    const html = await client.get("https://example.com/page");

    expect(html).toBe("<html><body>Hello</body></html>");
  });

  it("enforces rate limiting between requests", async () => {
    const axios = (await import("axios")).default;
    const mockInstance = axios.create();
    (mockInstance.get as any).mockResolvedValue({ data: "ok", status: 200 });

    const client = createHttpClient({ rateLimit: 100 });

    const start = Date.now();
    await client.get("https://example.com/1");
    await client.get("https://example.com/2");
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(90); // allow small timing variance
  });
});

describe("HttpClient.getRaw", () => {
  it("fetches a URL and returns the raw Buffer", async () => {
    const axios = (await import("axios")).default;
    const mockInstance = axios.create();
    const buf = Buffer.from("binary-data");
    (mockInstance.get as any).mockResolvedValue({ data: buf, status: 200 });

    const client = createHttpClient({ rateLimit: 0 });
    const raw = await client.getRaw("https://example.com/sitemap.xml.gz");

    expect(Buffer.isBuffer(raw) || raw instanceof Uint8Array).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/scraper/__tests__/http-client.test.ts
```

Expected: FAIL — `createHttpClient` not found.

- [ ] **Step 3: Implement http-client.ts**

```ts
// src/scraper/http-client.ts
import axios, { type AxiosInstance } from "axios";

export interface HttpClientOptions {
  /** Milliseconds to wait between requests */
  rateLimit: number;
  /** Optional proxy URL */
  proxy?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Custom User-Agent string */
  userAgent?: string;
}

export interface HttpClient {
  /** Fetch a URL and return HTML body as string */
  get(url: string): Promise<string>;
  /** Fetch a URL and return raw response as Buffer (for .gz sitemaps) */
  getRaw(url: string): Promise<Buffer>;
}

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const timeout = options.timeout ?? 30_000;

  const instance: AxiosInstance = axios.create({
    timeout,
    headers: { "User-Agent": options.userAgent ?? DEFAULT_UA },
    maxRedirects: 5,
    ...(options.proxy ? { proxy: false, httpsAgent: undefined } : {}),
  });

  let lastRequestTime = 0;

  async function enforceRateLimit(): Promise<void> {
    if (options.rateLimit <= 0) return;
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed < options.rateLimit) {
      await new Promise((r) => setTimeout(r, options.rateLimit - elapsed));
    }
  }

  return {
    async get(url: string): Promise<string> {
      await enforceRateLimit();
      lastRequestTime = Date.now();
      const resp = await instance.get<string>(url, { responseType: "text" });
      return resp.data;
    },

    async getRaw(url: string): Promise<Buffer> {
      await enforceRateLimit();
      lastRequestTime = Date.now();
      const resp = await instance.get(url, { responseType: "arraybuffer" });
      return Buffer.from(resp.data);
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/scraper/__tests__/http-client.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/scraper/http-client.ts src/scraper/__tests__/http-client.test.ts
git commit -m "Add HTTP client wrapper with rate limiting"
```

---

### Task 4: HTML Parser (cheerio wrapper)

**Files:**
- Create: `src/scraper/html-parser.ts`
- Create: `src/scraper/__tests__/html-parser.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/scraper/__tests__/html-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseHtml } from "../html-parser.js";

const SAMPLE_HTML = `
<html><body>
  <h1 class="product-name">Dance Trophy Gold</h1>
  <span class="sku">TRP-001</span>
  <span class="price">$29.95</span>
  <div class="images">
    <img src="https://example.com/img1.jpg">
    <img src="https://example.com/img2.jpg">
  </div>
  <table class="specs">
    <tr><td>Weight</td><td>150g</td></tr>
    <tr><td>Material</td><td>Resin</td></tr>
  </table>
  <ul class="attrs">
    <li>Colour: Gold</li>
    <li>Size: 150mm</li>
  </ul>
  <nav class="breadcrumb">
    <a href="/">Home</a>
    <a href="/trophies">Trophies</a>
    <a href="/trophies/dance">Dance</a>
  </nav>
  <select class="size-select">
    <option value="100">100mm</option>
    <option value="150">150mm</option>
    <option value="200">200mm</option>
  </select>
  <template data-variant-sku="TRP-001A">
    <table><tr><td>Size</td><td>100mm</td></tr></table>
  </template>
  <template data-variant-sku="TRP-001B">
    <table><tr><td>Size</td><td>150mm</td></tr></table>
  </template>
</body></html>
`;

describe("parseHtml", () => {
  it("returns a ParsedPage with query methods", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.text).toBeDefined();
    expect(page.optionalText).toBeDefined();
    expect(page.optionalNumber).toBeDefined();
    expect(page.allText).toBeDefined();
    expect(page.allAttr).toBeDefined();
    expect(page.exists).toBeDefined();
    expect(page.html).toBeDefined();
    expect(page.raw).toBeDefined();
  });
});

describe("ParsedPage.text", () => {
  it("extracts trimmed text content from a CSS selector", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.text(".product-name")).toBe("Dance Trophy Gold");
  });

  it("returns empty string when selector matches nothing", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.text(".nonexistent")).toBe("");
  });
});

describe("ParsedPage.optionalText", () => {
  it("returns string when element exists", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.optionalText(".sku")).toBe("TRP-001");
  });

  it("returns undefined when element is missing", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.optionalText(".nonexistent")).toBeUndefined();
  });
});

describe("ParsedPage.optionalNumber", () => {
  it("parses numeric text from an element", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.optionalNumber(".price")).toBe(29.95);
  });

  it("returns undefined for missing elements", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.optionalNumber(".nonexistent")).toBeUndefined();
  });
});

describe("ParsedPage.allText", () => {
  it("returns an array of text from all matching elements", () => {
    const page = parseHtml(SAMPLE_HTML);
    const crumbs = page.allText(".breadcrumb a");
    expect(crumbs).toEqual(["Home", "Trophies", "Dance"]);
  });

  it("returns empty array when nothing matches", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.allText(".nothing")).toEqual([]);
  });
});

describe("ParsedPage.allAttr", () => {
  it("extracts attribute values from all matching elements", () => {
    const page = parseHtml(SAMPLE_HTML);
    const srcs = page.allAttr(".images img", "src");
    expect(srcs).toEqual([
      "https://example.com/img1.jpg",
      "https://example.com/img2.jpg",
    ]);
  });
});

describe("ParsedPage.exists", () => {
  it("returns true when element exists", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.exists(".product-name")).toBe(true);
  });

  it("returns false when element is missing", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.exists(".nope")).toBe(false);
  });
});

describe("ParsedPage.html", () => {
  it("returns inner HTML of matched element", () => {
    const page = parseHtml("<div class='box'><b>bold</b></div>");
    expect(page.html(".box")).toBe("<b>bold</b>");
  });
});

describe("ParsedPage.raw", () => {
  it("returns the full HTML string", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.raw()).toContain("Dance Trophy Gold");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/scraper/__tests__/html-parser.test.ts
```

Expected: FAIL — `parseHtml` not found.

- [ ] **Step 3: Implement html-parser.ts**

```ts
// src/scraper/html-parser.ts
import * as cheerio from "cheerio";

export interface ParsedPage {
  /** Extract trimmed text from the first element matching selector. Returns "" if missing. */
  text(selector: string): string;
  /** Extract trimmed text, or undefined if missing. */
  optionalText(selector: string): string | undefined;
  /** Extract a number from element text (strips non-numeric chars). undefined if missing/NaN. */
  optionalNumber(selector: string): number | undefined;
  /** Extract trimmed text from ALL elements matching selector. */
  allText(selector: string): string[];
  /** Extract an attribute value from ALL matching elements. */
  allAttr(selector: string, attr: string): string[];
  /** Check whether at least one element matches the selector. */
  exists(selector: string): boolean;
  /** Return inner HTML of the first matching element. */
  html(selector: string): string;
  /** Return the full raw HTML string that was parsed. */
  raw(): string;
  /** Access the underlying cheerio instance for advanced queries. */
  $: cheerio.CheerioAPI;
}

export function parseHtml(html: string): ParsedPage {
  const $ = cheerio.load(html);

  return {
    text(selector: string): string {
      return $(selector).first().text().trim();
    },

    optionalText(selector: string): string | undefined {
      const el = $(selector).first();
      if (el.length === 0) return undefined;
      const t = el.text().trim();
      return t || undefined;
    },

    optionalNumber(selector: string): number | undefined {
      const el = $(selector).first();
      if (el.length === 0) return undefined;
      const t = el.text().trim();
      if (!t) return undefined;
      const parsed = parseFloat(t.replace(/[^0-9.\-]/g, ""));
      return isNaN(parsed) ? undefined : parsed;
    },

    allText(selector: string): string[] {
      const results: string[] = [];
      $(selector).each((_, el) => {
        const t = $(el).text().trim();
        if (t) results.push(t);
      });
      return results;
    },

    allAttr(selector: string, attr: string): string[] {
      const results: string[] = [];
      $(selector).each((_, el) => {
        const v = $(el).attr(attr);
        if (v) results.push(v);
      });
      return results;
    },

    exists(selector: string): boolean {
      return $(selector).length > 0;
    },

    html(selector: string): string {
      return $(selector).first().html() ?? "";
    },

    raw(): string {
      return html;
    },

    $,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/scraper/__tests__/html-parser.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/scraper/html-parser.ts src/scraper/__tests__/html-parser.test.ts
git commit -m "Add cheerio-based HTML parser with CSS selector API"
```

---

### Task 5: Template Tags Extractor

**Files:**
- Create: `src/scraper/extractors/template-tags.ts`
- Create: `src/scraper/__tests__/extractors.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/scraper/__tests__/extractors.test.ts
import { describe, it, expect } from "vitest";
import { extractTemplateTags } from "../extractors/template-tags.js";

describe("extractTemplateTags", () => {
  it("extracts variant SKUs and table data from <template> tags", () => {
    const html = `
      <div class="product">
        <template data-temp-id="CR198A">
          <table>
            <tr><td>Product Code</td><td>CR198A</td></tr>
            <tr><td>Size</td><td>100mm</td></tr>
            <tr><td>Weight</td><td>50g</td></tr>
          </table>
        </template>
        <template data-temp-id="CR198B">
          <table>
            <tr><td>Product Code</td><td>CR198B</td></tr>
            <tr><td>Size</td><td>150mm</td></tr>
            <tr><td>Weight</td><td>80g</td></tr>
          </table>
        </template>
      </div>`;

    const results = extractTemplateTags(html, {
      method: "template-tags",
      templateSelector: "template[data-temp-id]",
      skuAttribute: "data-temp-id",
      innerFormat: "table",
    });

    expect(results).toHaveLength(2);
    expect(results[0].sku).toBe("CR198A");
    expect(results[0].data["Product Code"]).toBe("CR198A");
    expect(results[0].data["Size"]).toBe("100mm");
    expect(results[1].sku).toBe("CR198B");
    expect(results[1].data["Size"]).toBe("150mm");
  });

  it("returns empty array when no templates match", () => {
    const results = extractTemplateTags("<div>no templates</div>", {
      method: "template-tags",
      templateSelector: "template[data-temp-id]",
      skuAttribute: "data-temp-id",
      innerFormat: "table",
    });
    expect(results).toEqual([]);
  });

  it("handles list innerFormat (li elements)", () => {
    const html = `
      <template data-sku="V1">
        <ul><li>Colour: Red</li><li>Weight: 50g</li></ul>
      </template>`;

    const results = extractTemplateTags(html, {
      method: "template-tags",
      templateSelector: "template[data-sku]",
      skuAttribute: "data-sku",
      innerFormat: "list",
    });

    expect(results).toHaveLength(1);
    expect(results[0].sku).toBe("V1");
    expect(results[0].data["Colour"]).toBe("Red");
    expect(results[0].data["Weight"]).toBe("50g");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/scraper/__tests__/extractors.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement template-tags.ts**

```ts
// src/scraper/extractors/template-tags.ts
import type { TemplateTagExtraction } from "../../pipeline/models.js";
import { parseHtml } from "../html-parser.js";

export interface TemplateVariant {
  sku: string;
  data: Record<string, string>;
}

/**
 * Extract variant data from <template> tags embedded in HTML.
 * Uses regex to find template elements (cheerio doesn't parse <template> content
 * by default), then parses inner HTML with cheerio.
 */
export function extractTemplateTags(
  html: string,
  config: TemplateTagExtraction,
): TemplateVariant[] {
  const results: TemplateVariant[] = [];

  // Build regex from config: match <template {skuAttribute}="VALUE">INNER</template>
  const attrName = escapeRegex(config.skuAttribute);
  const re = new RegExp(
    `<template[^>]*?${attrName}="([^"]+)"[^>]*>(.*?)</template>`,
    "gs",
  );

  for (const match of html.matchAll(re)) {
    const sku = match[1];
    const innerHtml = match[2];
    const data = config.innerFormat === "table"
      ? parseTable(innerHtml)
      : parseList(innerHtml);
    results.push({ sku, data });
  }

  return results;
}

function parseTable(html: string): Record<string, string> {
  const page = parseHtml(html);
  const data: Record<string, string> = {};
  page.$("tr").each((_, row) => {
    const cells = page.$(row).find("td");
    if (cells.length >= 2) {
      const key = page.$(cells[0]).text().trim();
      const val = page.$(cells[1]).text().trim();
      if (key) data[key] = val;
    }
  });
  return data;
}

function parseList(html: string): Record<string, string> {
  const page = parseHtml(html);
  const data: Record<string, string> = {};
  page.$("li").each((_, li) => {
    const text = page.$(li).text().trim();
    const colonIdx = text.indexOf(":");
    if (colonIdx > 0) {
      const key = text.slice(0, colonIdx).trim();
      const val = text.slice(colonIdx + 1).trim();
      if (key) data[key] = val;
    }
  });
  return data;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/scraper/__tests__/extractors.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/scraper/extractors/template-tags.ts src/scraper/__tests__/extractors.test.ts
git commit -m "Add template-tags extractor for variant data in HTML templates"
```

---

### Task 6: Select Dropdown Extractor

**Files:**
- Modify: `src/scraper/__tests__/extractors.test.ts`
- Create: `src/scraper/extractors/select-dropdown.ts`

- [ ] **Step 1: Add failing tests to extractors.test.ts**

```ts
import { extractSelectDropdown } from "../extractors/select-dropdown.js";

describe("extractSelectDropdown", () => {
  it("extracts options from a select element", () => {
    const html = `
      <select class="jsVariationDropdown">
        <option value="137">100</option>
        <option value="105">150</option>
        <option value="85">200</option>
      </select>`;

    const results = extractSelectDropdown(html, {
      method: "select-dropdown",
      dropdownSelector: "select.jsVariationDropdown",
      skuInference: "increment-last-letter",
    }, "D504A");

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ sku: "D504A", optionValue: "137", optionText: "100" });
    expect(results[1]).toEqual({ sku: "D504B", optionValue: "105", optionText: "150" });
    expect(results[2]).toEqual({ sku: "D504C", optionValue: "85", optionText: "200" });
  });

  it("uses from-option-value inference", () => {
    const html = `
      <select class="sizes">
        <option value="SKU-100">Small</option>
        <option value="SKU-200">Large</option>
      </select>`;

    const results = extractSelectDropdown(html, {
      method: "select-dropdown",
      dropdownSelector: "select.sizes",
      skuInference: "from-option-value",
    }, "PARENT");

    expect(results[0].sku).toBe("SKU-100");
    expect(results[1].sku).toBe("SKU-200");
  });

  it("returns empty array when no dropdown found", () => {
    const results = extractSelectDropdown("<div>nothing</div>", {
      method: "select-dropdown",
      dropdownSelector: "select.missing",
      skuInference: "increment-last-letter",
    }, "SKU-A");

    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/scraper/__tests__/extractors.test.ts
```

Expected: FAIL — `extractSelectDropdown` not found.

- [ ] **Step 3: Implement select-dropdown.ts**

```ts
// src/scraper/extractors/select-dropdown.ts
import type { SelectDropdownExtraction } from "../../pipeline/models.js";
import { parseHtml } from "../html-parser.js";

export interface DropdownVariant {
  sku: string;
  optionValue: string;
  optionText: string;
}

/**
 * Extract variant options from a <select> dropdown.
 * SKU inference determines how to derive variant SKUs from options.
 */
export function extractSelectDropdown(
  html: string,
  config: SelectDropdownExtraction,
  baseSku: string,
): DropdownVariant[] {
  const page = parseHtml(html);
  const results: DropdownVariant[] = [];

  page.$(config.dropdownSelector).find("option").each((idx, el) => {
    const optionValue = page.$(el).attr("value") ?? "";
    const optionText = page.$(el).text().trim();
    if (!optionValue || !optionText) return;

    let sku: string;
    switch (config.skuInference) {
      case "increment-last-letter":
        sku = idx === 0
          ? baseSku
          : baseSku.slice(0, -1) + String.fromCharCode(baseSku.charCodeAt(baseSku.length - 1) + idx);
        break;
      case "from-option-value":
        sku = optionValue;
        break;
      case "from-option-data":
        sku = page.$(el).attr("data-sku") ?? optionValue;
        break;
    }

    results.push({ sku, optionValue, optionText });
  });

  return results;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/scraper/__tests__/extractors.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/scraper/extractors/select-dropdown.ts src/scraper/__tests__/extractors.test.ts
git commit -m "Add select-dropdown extractor with SKU inference strategies"
```

---

### Task 7: Table Parser & Bullet List Extractors

**Files:**
- Create: `src/scraper/extractors/table-parser.ts`
- Create: `src/scraper/extractors/bullet-list.ts`
- Modify: `src/scraper/__tests__/extractors.test.ts`

- [ ] **Step 1: Add failing tests for both extractors**

```ts
import { extractTable } from "../extractors/table-parser.js";
import { extractBulletList } from "../extractors/bullet-list.js";

describe("extractTable", () => {
  it("extracts key-value pairs from table rows", () => {
    const html = `
      <table class="specs">
        <tr><td>Product Code</td><td>CR198A</td></tr>
        <tr><td>Size</td><td>150mm</td></tr>
        <tr><td>Weight</td><td>200g</td></tr>
      </table>`;

    const data = extractTable(html, { method: "visible-table", tableSelector: "table.specs" });
    expect(data).toEqual({
      "Product Code": "CR198A",
      "Size": "150mm",
      "Weight": "200g",
    });
  });

  it("returns empty object when table not found", () => {
    const data = extractTable("<div>no table</div>", { method: "visible-table", tableSelector: "table" });
    expect(data).toEqual({});
  });

  it("skips rows with fewer than 2 cells", () => {
    const html = `<table><tr><td>header</td></tr><tr><td>Key</td><td>Val</td></tr></table>`;
    const data = extractTable(html, { method: "visible-table", tableSelector: "table" });
    expect(data).toEqual({ "Key": "Val" });
  });
});

describe("extractBulletList", () => {
  it("extracts known key-value pairs from li elements", () => {
    const html = `
      <ul class="attrs">
        <li>Colour: Gold</li>
        <li>Material: Resin</li>
        <li>Some random text</li>
        <li>Weight(g): 150</li>
      </ul>`;

    const data = extractBulletList(html, {
      method: "bullet-list",
      listSelector: "ul.attrs li",
      knownKeys: ["Colour", "Material", "Weight(g)"],
    });

    expect(data).toEqual({
      "Colour": "Gold",
      "Material": "Resin",
      "Weight(g)": "150",
    });
  });

  it("ignores items without colon or with unknown keys", () => {
    const html = `<ul><li>no colon here</li><li>Unknown: value</li></ul>`;
    const data = extractBulletList(html, {
      method: "bullet-list",
      listSelector: "ul li",
      knownKeys: ["Known"],
    });
    expect(data).toEqual({});
  });

  it("returns empty object when no list items found", () => {
    const data = extractBulletList("<div>nothing</div>", {
      method: "bullet-list",
      listSelector: "li",
      knownKeys: ["Colour"],
    });
    expect(data).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/scraper/__tests__/extractors.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement table-parser.ts**

```ts
// src/scraper/extractors/table-parser.ts
import type { VisibleTableExtraction } from "../../pipeline/models.js";
import { parseHtml } from "../html-parser.js";

/**
 * Extract key-value pairs from an HTML table.
 * Expects rows with at least 2 <td> cells: key in first, value in second.
 */
export function extractTable(
  html: string,
  config: VisibleTableExtraction,
): Record<string, string> {
  const page = parseHtml(html);
  const data: Record<string, string> = {};

  page.$(config.tableSelector).find("tr").each((_, row) => {
    const cells = page.$(row).find("td");
    if (cells.length >= 2) {
      const key = page.$(cells[0]).text().trim();
      const val = page.$(cells[1]).text().trim();
      if (key) data[key] = val;
    }
  });

  return data;
}
```

- [ ] **Step 4: Implement bullet-list.ts**

```ts
// src/scraper/extractors/bullet-list.ts
import type { BulletListExtraction } from "../../pipeline/models.js";
import { parseHtml } from "../html-parser.js";

/**
 * Extract attribute key-value pairs from a bullet list.
 * Parses "Key: Value" patterns and filters to known keys.
 */
export function extractBulletList(
  html: string,
  config: BulletListExtraction,
): Record<string, string> {
  const page = parseHtml(html);
  const knownSet = new Set(config.knownKeys);
  const data: Record<string, string> = {};

  page.$(config.listSelector).each((_, li) => {
    const text = page.$(li).text().trim();
    const colonIdx = text.indexOf(":");
    if (colonIdx <= 0) return;
    const key = text.slice(0, colonIdx).trim();
    const val = text.slice(colonIdx + 1).trim();
    if (knownSet.has(key)) {
      data[key] = val;
    }
  });

  return data;
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/scraper/__tests__/extractors.test.ts
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/scraper/extractors/table-parser.ts src/scraper/extractors/bullet-list.ts src/scraper/__tests__/extractors.test.ts
git commit -m "Add table-parser and bullet-list extractors"
```

---

### Task 8: Breadcrumb Extractor

**Files:**
- Create: `src/scraper/extractors/breadcrumb.ts`
- Modify: `src/scraper/__tests__/extractors.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
import { extractBreadcrumb } from "../extractors/breadcrumb.js";

describe("extractBreadcrumb", () => {
  it("extracts category path from breadcrumb links", () => {
    const html = `
      <nav class="breadcrumb">
        <a href="/">Home</a> > <a href="/trophies">Trophies</a> > <a href="/trophies/dance">Dance</a>
      </nav>`;

    const path = extractBreadcrumb(html, ".breadcrumb a");
    expect(path).toEqual(["Home", "Trophies", "Dance"]);
  });

  it("returns empty array when selector matches nothing", () => {
    expect(extractBreadcrumb("<div></div>", ".breadcrumb a")).toEqual([]);
  });

  it("skips empty text nodes", () => {
    const html = `<div class="bc"><a>Home</a><a>  </a><a>Trophies</a></div>`;
    const path = extractBreadcrumb(html, ".bc a");
    expect(path).toEqual(["Home", "Trophies"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/scraper/__tests__/extractors.test.ts
```

- [ ] **Step 3: Implement breadcrumb.ts**

```ts
// src/scraper/extractors/breadcrumb.ts
import { parseHtml } from "../html-parser.js";

/**
 * Extract a category path from breadcrumb navigation.
 */
export function extractBreadcrumb(html: string, selector: string): string[] {
  const page = parseHtml(html);
  return page.allText(selector);
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/scraper/__tests__/extractors.test.ts
```

Expected: All pass.

- [ ] **Step 5: Create extractors barrel export**

```ts
// src/scraper/extractors/index.ts
export { extractTemplateTags, type TemplateVariant } from "./template-tags.js";
export { extractSelectDropdown, type DropdownVariant } from "./select-dropdown.js";
export { extractTable } from "./table-parser.js";
export { extractBulletList } from "./bullet-list.js";
export { extractBreadcrumb } from "./breadcrumb.js";
```

- [ ] **Step 6: Commit**

```bash
git add src/scraper/extractors/breadcrumb.ts src/scraper/extractors/index.ts src/scraper/__tests__/extractors.test.ts
git commit -m "Add breadcrumb extractor and extractors barrel export"
```

---

### Task 9: Product Extraction from HTML (replaces Playwright extractProduct)

**Files:**
- Create: `src/scraper/extract-product.ts`
- Create: `src/scraper/__tests__/extract-product.test.ts`

This is the core function that takes a product page's HTML + SiteConfig and returns `RawProduct[]` (one per variant). It replaces the Playwright-based `extractProduct` from `engine.ts`.

- [ ] **Step 1: Write failing tests**

```ts
// src/scraper/__tests__/extract-product.test.ts
import { describe, it, expect } from "vitest";
import { extractProductsFromHtml } from "../extract-product.js";
import type { SiteConfig } from "../../pipeline/models.js";

function makeConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    name: "test",
    baseUrl: "https://example.com",
    discovery: { type: "sitemap", url: "https://example.com/sitemap.xml", filterPatterns: [] },
    selectors: { name: ".name", sku: ".sku", images: ".images img" },
    attributes: [],
    rateLimit: 0,
    variants: { type: "same-page" },
    pipeline: "http-direct",
    variantExtraction: { method: "visible-table", tableSelector: "table" },
    ...overrides,
  };
}

describe("extractProductsFromHtml", () => {
  it("extracts a single simple product from HTML", () => {
    const html = `
      <h1 class="name">Dance Trophy Gold</h1>
      <span class="sku">TRP-001</span>
      <div class="images"><img src="https://example.com/img1.jpg"></div>
      <table><tr><td>Weight</td><td>150g</td></tr></table>`;

    const config = makeConfig();
    const products = extractProductsFromHtml(html, "https://example.com/product-1", config);

    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("Dance Trophy Gold");
    expect(products[0].sku).toBe("TRP-001");
    expect(products[0].images).toEqual(["https://example.com/img1.jpg"]);
    expect(products[0].sourceUrl).toBe("https://example.com/product-1");
    expect(products[0].scrapedAt).toBeDefined();
  });

  it("extracts multiple variants from template tags", () => {
    const html = `
      <h1 class="name">Trophy</h1>
      <span class="sku">CR198</span>
      <div class="images"><img src="https://example.com/img.jpg"></div>
      <template data-temp-id="CR198A">
        <table><tr><td>Size</td><td>100mm</td></tr></table>
      </template>
      <template data-temp-id="CR198B">
        <table><tr><td>Size</td><td>150mm</td></tr></table>
      </template>`;

    const config = makeConfig({
      variantExtraction: {
        method: "template-tags",
        templateSelector: "template[data-temp-id]",
        skuAttribute: "data-temp-id",
        innerFormat: "table",
      },
    });

    const products = extractProductsFromHtml(html, "https://example.com/p", config);

    expect(products).toHaveLength(2);
    expect(products[0].sku).toBe("CR198A");
    expect(products[1].sku).toBe("CR198B");
  });

  it("extracts variants from select dropdown with SKU inference", () => {
    const html = `
      <h1 class="name">Star Stand</h1>
      <span class="sku">D504A</span>
      <div class="images"><img src="https://example.com/img.jpg"></div>
      <select class="jsVariationDropdown">
        <option value="100">100</option>
        <option value="150">150</option>
        <option value="200">200</option>
      </select>`;

    const config = makeConfig({
      variantExtraction: {
        method: "select-dropdown",
        dropdownSelector: "select.jsVariationDropdown",
        skuInference: "increment-last-letter",
      },
    });

    const products = extractProductsFromHtml(html, "https://example.com/p", config);

    expect(products).toHaveLength(3);
    expect(products[0].sku).toBe("D504A");
    expect(products[1].sku).toBe("D504B");
    expect(products[2].sku).toBe("D504C");
  });

  it("throws when name or sku selector matches nothing", () => {
    const html = `<div>empty page</div>`;
    const config = makeConfig();

    expect(() =>
      extractProductsFromHtml(html, "https://example.com/p", config)
    ).toThrow();
  });

  it("extracts optional fields: price, description, breadcrumb, extra attributes", () => {
    const html = `
      <h1 class="name">Trophy</h1>
      <span class="sku">SKU-1</span>
      <div class="images"><img src="https://example.com/img.jpg"></div>
      <span class="price">$29.95</span>
      <p class="desc">A fine trophy</p>
      <nav class="bc"><a>Home</a><a>Trophies</a></nav>
      <span class="colour">Gold</span>`;

    const config = makeConfig({
      selectors: {
        name: ".name",
        sku: ".sku",
        images: ".images img",
        price: ".price",
        description: ".desc",
        categoryBreadcrumb: ".bc a",
        extra: { pa_colour: ".colour" },
      },
    });

    const products = extractProductsFromHtml(html, "https://example.com/p", config);
    expect(products[0].price).toBe(29.95);
    expect(products[0].description).toBe("A fine trophy");
    expect(products[0].categoryPath).toEqual(["Home", "Trophies"]);
    expect(products[0].attributes).toEqual({ pa_colour: "Gold" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/scraper/__tests__/extract-product.test.ts
```

- [ ] **Step 3: Implement extract-product.ts**

```ts
// src/scraper/extract-product.ts
import type { SiteConfig, RawProduct } from "../pipeline/models.js";
import { parseHtml } from "./html-parser.js";
import { extractTemplateTags } from "./extractors/template-tags.js";
import { extractSelectDropdown } from "./extractors/select-dropdown.js";
import { extractTable } from "./extractors/table-parser.js";
import { extractBulletList } from "./extractors/bullet-list.js";
import { extractBreadcrumb } from "./extractors/breadcrumb.js";

/**
 * Extract RawProduct(s) from a product page's HTML.
 * Returns one product for simple items, multiple for items with variants.
 * This is the HTTP-tier replacement for the Playwright-based extractProduct().
 */
export function extractProductsFromHtml(
  html: string,
  url: string,
  config: SiteConfig,
): RawProduct[] {
  const page = parseHtml(html);
  const s = config.selectors;

  // Required fields
  const name = page.text(s.name);
  const sku = page.text(s.sku);
  if (!name) throw new Error(`Missing product name at ${url}`);
  if (!sku) throw new Error(`Missing product SKU at ${url}`);

  // Images
  const images = page.allAttr(s.images, "src");

  // Optional fields
  const description = s.description ? page.optionalText(s.description) : undefined;
  const shortDescription = s.shortDescription ? page.optionalText(s.shortDescription) : undefined;
  const price = s.price ? page.optionalNumber(s.price) : undefined;

  // Dimensions
  const weight = s.weight ? page.optionalNumber(s.weight) : undefined;
  const width = s.width ? page.optionalNumber(s.width) : undefined;
  const height = s.height ? page.optionalNumber(s.height) : undefined;
  const dimensions = (weight !== undefined || width !== undefined || height !== undefined)
    ? { weight, width, height }
    : undefined;

  // Category breadcrumb
  const categoryPath = s.categoryBreadcrumb
    ? extractBreadcrumb(html, s.categoryBreadcrumb)
    : [];

  // Extra attributes
  const attributes: Record<string, string> = {};
  if (s.extra) {
    for (const [slug, selector] of Object.entries(s.extra)) {
      const val = page.optionalText(selector);
      if (val) attributes[slug] = val;
    }
  }

  const now = new Date().toISOString();

  // Base product fields shared by all variants
  const base = {
    name,
    sourceUrl: url,
    categoryPath,
    attributes,
    price,
    images,
    dimensions,
    description,
    shortDescription,
    scrapedAt: now,
  };

  // Variant extraction
  const ve = config.variantExtraction;

  if (ve.method === "template-tags") {
    const variants = extractTemplateTags(html, ve);
    if (variants.length > 0) {
      return variants.map((v) => ({
        ...base,
        sku: v.sku,
        attributes: { ...attributes, ...v.data },
      }));
    }
  }

  if (ve.method === "select-dropdown") {
    const variants = extractSelectDropdown(html, ve, sku);
    if (variants.length > 1) {
      return variants.map((v) => ({
        ...base,
        sku: v.sku,
        attributes: { ...attributes, _optionValue: v.optionValue, _optionText: v.optionText },
      }));
    }
  }

  if (ve.method === "bullet-list") {
    const data = extractBulletList(html, ve);
    return [{ ...base, sku, attributes: { ...attributes, ...data } }];
  }

  if (ve.method === "visible-table") {
    const data = extractTable(html, ve);
    return [{ ...base, sku, attributes: { ...attributes, ...data } }];
  }

  // Default: single product, no variant extraction
  return [{ ...base, sku }];
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/scraper/__tests__/extract-product.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/scraper/extract-product.ts src/scraper/__tests__/extract-product.test.ts
git commit -m "Add HTML-based product extraction with variant support"
```

---

### Task 10: HTTP Direct Pipeline (Tier 1)

**Files:**
- Create: `src/scraper/pipelines/http-direct.ts`
- Create: `src/scraper/__tests__/pipelines.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/scraper/__tests__/pipelines.test.ts
import { describe, it, expect, vi } from "vitest";
import type { SiteConfig } from "../../pipeline/models.js";

// Mock http-client
vi.mock("../http-client.js", () => ({
  createHttpClient: vi.fn(),
}));

import { createHttpClient } from "../http-client.js";
import { httpDirectPipeline } from "../pipelines/http-direct.js";

function makeConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    name: "test",
    baseUrl: "https://example.com",
    discovery: {
      type: "category-list",
      sections: [{ name: "Trophies", path: "/trophies", categories: ["dance"] }],
    },
    selectors: { name: ".name", sku: ".sku", images: ".images img" },
    attributes: [],
    rateLimit: 0,
    variants: { type: "same-page" },
    pipeline: "http-direct",
    variantExtraction: { method: "visible-table", tableSelector: "table" },
    ...overrides,
  };
}

describe("httpDirectPipeline", () => {
  it("discovers product URLs from category pages and scrapes each", async () => {
    const categoryHtml = `
      <div>
        <a href="https://example.com/product-1">Product 1</a>
        <a href="https://example.com/product-2">Product 2</a>
      </div>`;

    const productHtml = `
      <h1 class="name">Trophy</h1>
      <span class="sku">SKU-1</span>
      <div class="images"><img src="https://example.com/img.jpg"></div>`;

    const mockGet = vi.fn()
      .mockResolvedValueOnce(categoryHtml)    // category page
      .mockResolvedValueOnce(categoryHtml)    // page 2 check (returns same, no new links → stops)
      .mockResolvedValueOnce(productHtml)     // product 1
      .mockResolvedValueOnce(productHtml);    // product 2

    (createHttpClient as any).mockReturnValue({ get: mockGet, getRaw: vi.fn() });

    const config = makeConfig();
    const result = await httpDirectPipeline(config);

    expect(result.products.length).toBeGreaterThanOrEqual(1);
    expect(result.errors).toHaveLength(0);
    expect(result.products[0].sku).toBe("SKU-1");
  });

  it("collects errors for failed product fetches", async () => {
    const categoryHtml = `<a href="https://example.com/product-1">P1</a>`;

    const mockGet = vi.fn()
      .mockResolvedValueOnce(categoryHtml)    // category page
      .mockResolvedValueOnce(categoryHtml)    // page 2 (same → stop)
      .mockRejectedValue(new Error("timeout"));

    (createHttpClient as any).mockReturnValue({ get: mockGet, getRaw: vi.fn() });

    const config = makeConfig();
    const result = await httpDirectPipeline(config);

    expect(result.products).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/scraper/__tests__/pipelines.test.ts
```

- [ ] **Step 3: Implement http-direct.ts**

```ts
// src/scraper/pipelines/http-direct.ts
import type { SiteConfig, RawProduct } from "../../pipeline/models.js";
import type { ScrapeResult, ScrapeError, ScrapeProgress } from "../engine.js";
import { createHttpClient } from "../http-client.js";
import { parseHtml } from "../html-parser.js";
import { extractProductsFromHtml } from "../extract-product.js";
import { withRetry } from "../engine.js";

/**
 * Tier 1: HTTP Direct Pipeline.
 * Discovers product URLs from category pages via pagination,
 * then fetches and parses each product page with cheerio.
 */
export async function httpDirectPipeline(
  config: SiteConfig,
  onProgress?: (progress: ScrapeProgress) => void,
): Promise<ScrapeResult> {
  const client = createHttpClient({ rateLimit: config.rateLimit });
  const products: RawProduct[] = [];
  const errors: ScrapeError[] = [];

  // Phase 1: Discover product URLs from category pages
  onProgress?.({ phase: "discovering", current: 0, total: 0 });
  const productUrls = await discoverFromCategories(config, client);

  // Phase 2: Scrape each product
  const total = productUrls.length;
  for (let i = 0; i < total; i++) {
    const url = productUrls[i];
    onProgress?.({ phase: "scraping", current: i + 1, total, currentUrl: url });

    try {
      const html = await withRetry(() => client.get(url));
      const extracted = extractProductsFromHtml(html, url, config);
      products.push(...extracted);
    } catch (err) {
      errors.push({
        url,
        error: err instanceof Error ? err.message : String(err),
        retries: 3,
      });
    }
  }

  return { products, errors };
}

/**
 * Discover product URLs by fetching category pages.
 * For category-list discovery: iterate sections/categories, extract links.
 * For pagination discovery: follow next-page links.
 */
async function discoverFromCategories(
  config: SiteConfig,
  client: { get(url: string): Promise<string> },
): Promise<string[]> {
  const urls = new Set<string>();
  const disc = config.discovery;

  if (disc.type === "category-list") {
    for (const section of disc.sections) {
      for (const cat of section.categories) {
        const categoryUrl = `${config.baseUrl}${section.path}/${cat}`;
        let page = 1;
        let prevCount = -1;

        while (urls.size !== prevCount) {
          prevCount = urls.size;
          const pageUrl = page === 1 ? categoryUrl : `${categoryUrl}?page=${page}`;
          try {
            const html = await client.get(pageUrl);
            const parsed = parseHtml(html);
            const links = parsed.allAttr("a", "href");
            for (const link of links) {
              if (link.startsWith(config.baseUrl) && link !== categoryUrl) {
                urls.add(link);
              }
            }
          } catch {
            break; // 404 or error = no more pages
          }
          page++;
        }
      }
    }
  } else if (disc.type === "pagination") {
    // For pagination-type discovery with HTTP, start from baseUrl
    let currentUrl: string | null = config.baseUrl;
    const visited = new Set<string>();
    let pageCount = 0;

    while (currentUrl && pageCount < 500) {
      if (visited.has(currentUrl)) break;
      visited.add(currentUrl);
      pageCount++;

      try {
        const html = await client.get(currentUrl);
        const parsed = parseHtml(html);

        // Extract product links
        const links = parsed.allAttr(disc.listSelector + " a, " + disc.listSelector, "href");
        for (const link of links) {
          if (link) urls.add(link);
        }

        // Find next page link
        const nextHref = parsed.$(`${disc.nextSelector}`).attr("href") ?? null;
        currentUrl = nextHref;
      } catch {
        break;
      }
    }
  }

  return [...urls];
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/scraper/__tests__/pipelines.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/scraper/pipelines/http-direct.ts src/scraper/__tests__/pipelines.test.ts
git commit -m "Add HTTP direct pipeline (tier 1) with category discovery"
```

---

### Task 11: Sitemap + HTTP Pipeline (Tier 2)

**Files:**
- Create: `src/scraper/pipelines/sitemap-http.ts`
- Modify: `src/scraper/__tests__/pipelines.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
import { sitemapHttpPipeline } from "../pipelines/sitemap-http.js";

describe("sitemapHttpPipeline", () => {
  it("fetches sitemap, extracts product URLs, and scrapes each", async () => {
    const sitemapXml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/product-1</loc></url>
        <url><loc>https://example.com/product-2</loc></url>
        <url><loc>https://example.com/about</loc></url>
      </urlset>`;

    const productHtml = `
      <h1 class="name">Trophy</h1>
      <span class="sku">SKU-1</span>
      <div class="images"><img src="https://example.com/img.jpg"></div>
      <nav class="bc"><a>Trophies</a><a>Dance</a></nav>`;

    const mockGet = vi.fn()
      .mockResolvedValueOnce(sitemapXml)    // sitemap
      .mockResolvedValueOnce(productHtml)   // product 1
      .mockResolvedValueOnce(productHtml);  // product 2 (about is filtered)

    (createHttpClient as any).mockReturnValue({ get: mockGet, getRaw: vi.fn() });

    const config = makeConfig({
      discovery: {
        type: "sitemap",
        url: "https://example.com/sitemap.xml",
        filterPatterns: ["/product-"],
      },
      pipeline: "sitemap-http",
      selectors: {
        name: ".name", sku: ".sku", images: ".images img",
        categoryBreadcrumb: ".bc a",
      },
    });

    const result = await sitemapHttpPipeline(config);

    expect(result.products).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it("handles gzipped sitemaps", async () => {
    const { gzipSync } = await import("node:zlib");
    const xml = `<urlset><url><loc>https://example.com/p1</loc></url></urlset>`;
    const gzipped = gzipSync(Buffer.from(xml));

    const productHtml = `
      <h1 class="name">Trophy</h1>
      <span class="sku">S1</span>
      <div class="images"><img src="https://example.com/i.jpg"></div>`;

    const mockGet = vi.fn().mockResolvedValue(productHtml);
    const mockGetRaw = vi.fn().mockResolvedValue(gzipped);

    (createHttpClient as any).mockReturnValue({ get: mockGet, getRaw: mockGetRaw });

    const config = makeConfig({
      discovery: {
        type: "sitemap",
        url: "https://example.com/sitemap.xml.gz",
        filterPatterns: [],
      },
      pipeline: "sitemap-http",
    });

    const result = await sitemapHttpPipeline(config);
    expect(result.products).toHaveLength(1);
    expect(mockGetRaw).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/scraper/__tests__/pipelines.test.ts
```

- [ ] **Step 3: Implement sitemap-http.ts**

```ts
// src/scraper/pipelines/sitemap-http.ts
import { gunzipSync } from "node:zlib";
import type { SiteConfig, RawProduct, SitemapDiscovery } from "../../pipeline/models.js";
import type { ScrapeResult, ScrapeError, ScrapeProgress } from "../engine.js";
import { createHttpClient } from "../http-client.js";
import { extractProductsFromHtml } from "../extract-product.js";
import { withRetry } from "../engine.js";

/**
 * Tier 2: Sitemap + HTTP Pipeline.
 * Fetches sitemap.xml → extracts product URLs → fetches each with HTTP → parses with cheerio.
 * Categories matched post-hoc from breadcrumbs on each product page.
 */
export async function sitemapHttpPipeline(
  config: SiteConfig,
  onProgress?: (progress: ScrapeProgress) => void,
): Promise<ScrapeResult> {
  const client = createHttpClient({ rateLimit: config.rateLimit });
  const products: RawProduct[] = [];
  const errors: ScrapeError[] = [];

  // Phase 1: Fetch and parse sitemap
  onProgress?.({ phase: "discovering", current: 0, total: 0 });

  const disc = config.discovery as SitemapDiscovery;
  const productUrls = await fetchSitemapUrls(disc, client);

  // Phase 2: Scrape each product
  const total = productUrls.length;
  for (let i = 0; i < total; i++) {
    const url = productUrls[i];
    onProgress?.({ phase: "scraping", current: i + 1, total, currentUrl: url });

    try {
      const html = await withRetry(() => client.get(url));
      const extracted = extractProductsFromHtml(html, url, config);
      products.push(...extracted);
    } catch (err) {
      errors.push({
        url,
        error: err instanceof Error ? err.message : String(err),
        retries: 3,
      });
    }
  }

  return { products, errors };
}

async function fetchSitemapUrls(
  disc: SitemapDiscovery,
  client: { get(url: string): Promise<string>; getRaw(url: string): Promise<Buffer> },
): Promise<string[]> {
  let xml: string;

  if (disc.url.endsWith(".gz")) {
    const buf = await client.getRaw(disc.url);
    xml = gunzipSync(buf).toString("utf-8");
  } else {
    xml = await client.get(disc.url);
  }

  // Extract all <loc> URLs
  const urls: string[] = [];
  const re = /<loc>\s*(.*?)\s*<\/loc>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    urls.push(match[1]);
  }

  // Apply filter patterns
  if (disc.filterPatterns.length > 0) {
    const regexes = disc.filterPatterns.map((p) => new RegExp(p));
    return urls.filter((u) => regexes.some((r) => r.test(u)));
  }

  return urls;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/scraper/__tests__/pipelines.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/scraper/pipelines/sitemap-http.ts src/scraper/__tests__/pipelines.test.ts
git commit -m "Add sitemap+HTTP pipeline (tier 2) with gzip support"
```

---

### Task 12: Refactor Engine to Dispatch by Pipeline Tier

**Files:**
- Modify: `src/scraper/engine.ts`
- Modify: `src/scraper/__tests__/engine.test.ts`
- Modify: `src/scraper/index.ts`

- [ ] **Step 1: Update engine.ts to dispatch by SiteConfig.pipeline**

Keep `withRetry`, `ScrapeOptions`, `ScrapeResult`, `ScrapeError`, `ScrapeProgress` exports. Replace the body of `scrape()` to dispatch:

```ts
// src/scraper/engine.ts
import type { SiteConfig, RawProduct } from "../pipeline/models.js";
import { httpDirectPipeline } from "./pipelines/http-direct.js";
import { sitemapHttpPipeline } from "./pipelines/sitemap-http.js";

// Keep these public interfaces exactly as they are:
export interface ScrapeOptions { /* unchanged */ }
export interface ScrapeProgress { /* unchanged */ }
export interface ScrapeResult { /* unchanged */ }
export interface ScrapeError { /* unchanged */ }
export { withRetry }; // keep utility

/**
 * Main scrape entry point. Dispatches to the correct pipeline
 * based on SiteConfig.pipeline tier.
 */
export async function scrape(options: ScrapeOptions): Promise<ScrapeResult> {
  const { config, onProgress } = options;

  switch (config.pipeline) {
    case "http-direct":
      return httpDirectPipeline(config, onProgress);

    case "sitemap-http":
      return sitemapHttpPipeline(config, onProgress);

    case "playwright": {
      // Lazy import to avoid requiring Playwright when not needed
      const { playwrightPipeline } = await import("./pipelines/playwright.js");
      return playwrightPipeline(config, onProgress);
    }

    default:
      throw new Error(`Unknown pipeline: ${(config as any).pipeline}`);
  }
}
```

Remove the old `extractProduct`, `BrowserManager` import, discovery strategy imports, and the old `scrape()` implementation. The `withRetry` function stays in `engine.ts` since it's used by pipelines.

- [ ] **Step 2: Create pipelines/playwright.ts wrapping the old code**

Move the old Playwright-based scraping logic into `src/scraper/pipelines/playwright.ts`. It should import `BrowserManager` from `../playwright.js` and implement the same `ScrapeResult` interface. Keep the old `extractProduct` function here (it's the Playwright-specific version).

```ts
// src/scraper/pipelines/playwright.ts
import type { SiteConfig, RawProduct } from "../../pipeline/models.js";
import type { ScrapeResult, ScrapeError, ScrapeProgress } from "../engine.js";
import { BrowserManager } from "../playwright.js";
import { discoverProducts } from "../strategies/index.js";
import { withRetry } from "../engine.js";

const MAX_RETRIES = 3;

/**
 * Tier 3: Playwright Pipeline (last resort).
 * Full browser automation for JS-rendered sites.
 */
export async function playwrightPipeline(
  config: SiteConfig,
  onProgress?: (progress: ScrapeProgress) => void,
): Promise<ScrapeResult> {
  const browser = new BrowserManager({ rateLimit: config.rateLimit });
  await browser.launch();

  const products: RawProduct[] = [];
  const errors: ScrapeError[] = [];

  try {
    onProgress?.({ phase: "discovering", current: 0, total: 0 });
    const { urls } = await withRetry(() => discoverProducts(config, browser), MAX_RETRIES);

    const total = urls.length;
    for (let i = 0; i < total; i++) {
      const url = urls[i];
      onProgress?.({ phase: "scraping", current: i + 1, total, currentUrl: url });

      try {
        const product = await withRetry(
          () => extractProductPlaywright(url, config, browser),
          MAX_RETRIES,
        );
        products.push(product);
      } catch (err) {
        errors.push({
          url,
          error: err instanceof Error ? err.message : String(err),
          retries: MAX_RETRIES,
        });
      }
    }
  } finally {
    await browser.close();
  }

  return { products, errors };
}

// Move the old extractProduct function here, renamed to avoid confusion
async function extractProductPlaywright(
  url: string,
  config: SiteConfig,
  browser: BrowserManager,
): Promise<RawProduct> {
  // ... exact same implementation as the old extractProduct from engine.ts ...
  const page = await browser.goto(url);
  const selectors = config.selectors;

  const name = await textContent(page, selectors.name);
  const sku = await textContent(page, selectors.sku);
  if (!name) throw new Error(`Missing product name at ${url}`);
  if (!sku) throw new Error(`Missing product SKU at ${url}`);

  const images = await page.$$eval(selectors.images, (els: Element[]) =>
    els
      .map((el) => {
        if (el instanceof HTMLImageElement) return el.src;
        if (el instanceof HTMLAnchorElement) return el.href;
        return el.getAttribute("src") ?? el.getAttribute("href") ?? "";
      })
      .filter((src) => src !== ""),
  );

  const description = selectors.description
    ? await optionalText(page, selectors.description)
    : undefined;
  const shortDescription = selectors.shortDescription
    ? await optionalText(page, selectors.shortDescription)
    : undefined;

  let price: number | undefined;
  if (selectors.price) {
    const priceText = await optionalText(page, selectors.price);
    if (priceText) {
      const parsed = parseFloat(priceText.replace(/[^0-9.]/g, ""));
      if (!isNaN(parsed)) price = parsed;
    }
  }

  const weight = selectors.weight ? await optionalNumber(page, selectors.weight) : undefined;
  const width = selectors.width ? await optionalNumber(page, selectors.width) : undefined;
  const height = selectors.height ? await optionalNumber(page, selectors.height) : undefined;
  const dimensions = (weight !== undefined || width !== undefined || height !== undefined)
    ? { weight, width, height }
    : undefined;

  const categoryPath: string[] = [];
  if (selectors.categoryBreadcrumb) {
    const crumbs = await page.$$eval(selectors.categoryBreadcrumb, (els: Element[]) =>
      els.map((el) => (el.textContent ?? "").trim()),
    );
    categoryPath.push(...crumbs.filter((c) => c.length > 0));
  }

  const attributes: Record<string, string> = {};
  if (selectors.extra) {
    for (const [slug, selector] of Object.entries(selectors.extra)) {
      const value = await optionalText(page, selector);
      if (value) attributes[slug] = value;
    }
  }

  return {
    sku, name, sourceUrl: url, categoryPath, attributes, price, images,
    dimensions, description, shortDescription, scrapedAt: new Date().toISOString(),
  };
}

async function textContent(page: any, selector: string): Promise<string> {
  const el = await page.$(selector);
  if (!el) return "";
  const text = await el.textContent();
  return (text ?? "").trim();
}

async function optionalText(page: any, selector: string): Promise<string | undefined> {
  const text = await textContent(page, selector);
  return text || undefined;
}

async function optionalNumber(page: any, selector: string): Promise<number | undefined> {
  const text = await textContent(page, selector);
  if (!text) return undefined;
  const parsed = parseFloat(text.replace(/[^0-9.]/g, ""));
  return isNaN(parsed) ? undefined : parsed;
}
```

- [ ] **Step 3: Update scrape-category activity**

In `src/temporal/activities/scrape-category.ts`, remove the `browser` parameter (no longer needed — the engine handles it internally):

```ts
import { scrape } from "../../scraper/engine.js";
import type { SiteConfig, RawProduct } from "../../pipeline/models.js";
import type { ScrapeError } from "../../scraper/engine.js";

export interface ScrapeCategoryResult {
  products: RawProduct[];
  errors: ScrapeError[];
}

export async function scrapeCategoryActivity(
  config: SiteConfig,
  category?: string,
): Promise<ScrapeCategoryResult> {
  return scrape({
    config,
    categories: category ? [category] : undefined,
  });
}
```

This is unchanged from current code — `scrape()` signature lost the optional `browser` param but the activity never passed one.

- [ ] **Step 4: Update index.ts barrel export**

Remove `BrowserManager` and `extractProduct` from the public barrel. Keep `BrowserOptions` type if other code needs it.

```ts
// src/scraper/index.ts
export {
  scrape,
  withRetry,
  type ScrapeOptions,
  type ScrapeProgress,
  type ScrapeResult,
  type ScrapeError,
} from "./engine.js";
export * from "./extractors/index.js";
```

- [ ] **Step 5: Update existing engine tests**

The existing `engine.test.ts` tests for `discoverFromSitemap`, `discoverFromCategoryList`, `discoverFromPagination`, and `discoverProducts` should stay since those strategies are still used by the Playwright tier. The `extractProduct` tests and `scrape` integration tests need to be updated to test the new dispatch-based `scrape()`.

Update the `scrape` describe block tests to use `pipeline: "http-direct"` or `pipeline: "sitemap-http"` configs instead of passing a mock `BrowserManager`. The Playwright-specific tests (`extractProduct`) can be moved to a new `src/scraper/__tests__/playwright-pipeline.test.ts` or kept in engine.test.ts with `pipeline: "playwright"` configs and mocked Playwright.

- [ ] **Step 6: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (363 existing + new extractor/pipeline tests).

- [ ] **Step 7: Commit**

```bash
git add src/scraper/engine.ts src/scraper/pipelines/playwright.ts src/scraper/index.ts src/temporal/activities/scrape-category.ts src/scraper/__tests__/engine.test.ts
git commit -m "Refactor engine to dispatch by pipeline tier, move Playwright to tier 3"
```

---

### Task 13: Update Opus Recon System Prompt

**Files:**
- Modify: `src/agents/site-recon.ts`

- [ ] **Step 1: Expand the SYSTEM_PROMPT to include pipeline selection and variantExtraction**

Add to the system prompt in `site-recon.ts`:

1. Document the `pipeline` field: `"http-direct" | "sitemap-http" | "playwright"` with guidance to strongly prefer HTTP tiers
2. Document `variantExtraction` with all five methods and their parameters
3. Add instructions for Opus to:
   - Check `/sitemap.xml` and `/sitemap.xml.gz` availability
   - Inspect product page HTML source for variant data patterns (template tags, select dropdowns, etc.)
   - Determine cheapest pipeline (http-direct → sitemap-http → playwright)
   - Note: Playwright is extremely expensive, slow, and resource-intensive. Only recommend if the site is a genuine JS-rendered SPA with no HTML data in initial response.

- [ ] **Step 2: Update validation in analyzeSite()**

Add `pipeline` and `variantExtraction` to the required fields check:

```ts
const requiredFields: Array<keyof SiteConfig> = [
  "name", "baseUrl", "discovery", "selectors", "attributes",
  "rateLimit", "variants", "pipeline", "variantExtraction",
];
```

- [ ] **Step 3: Update example config**

Update `configs/example.yaml` to include the new fields:

```yaml
# Scraping pipeline tier (http-direct | sitemap-http | playwright)
pipeline: "http-direct"

# How to extract variant data from product pages
variantExtraction:
  method: "template-tags"
  templateSelector: "template[data-temp-id]"
  skuAttribute: "data-temp-id"
  innerFormat: "table"
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: All pass. Agent tests mock the SDK so they won't be affected by prompt changes.

- [ ] **Step 5: Commit**

```bash
git add src/agents/site-recon.ts configs/example.yaml
git commit -m "Expand Opus recon to select pipeline tier and variant extraction method"
```

---

### Task 14: Make Playwright an Optional Dependency

**Files:**
- Modify: `package.json`
- Modify: `tsup.config.ts`

- [ ] **Step 1: Move playwright to optionalDependencies**

In `package.json`, move `"playwright": "^1.52.0"` from `dependencies` to `optionalDependencies`. This means `npm install` will still install it (for Docker builds that need tier 3), but it won't be required for the HTTP-only tiers.

```json
{
  "optionalDependencies": {
    "playwright": "^1.52.0"
  }
}
```

- [ ] **Step 2: Mark playwright as external in tsup config**

In `tsup.config.ts`, add playwright to external so it's not bundled:

```ts
export default defineConfig({
  entry: ["src/cli/app.tsx", "src/temporal/worker.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: true,
  external: ["playwright"],
});
```

- [ ] **Step 3: Verify build and tests**

```bash
npm run build && npx vitest run
```

Expected: Build succeeds, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add package.json tsup.config.ts
git commit -m "Make playwright an optional dependency for tier 3 only"
```

---

### Task 15: Final Integration Test & Cleanup

**Files:**
- Various cleanup across modified files

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: No type errors.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: Clean build to `dist/`.

- [ ] **Step 4: Verify the old strategies still work for Playwright tier**

The files in `src/scraper/strategies/` (sitemap.ts, category-list.ts, pagination.ts) are only used by the Playwright pipeline now. Verify their tests still pass:

```bash
npx vitest run src/scraper/__tests__/engine.test.ts
```

- [ ] **Step 5: Commit any final cleanup**

```bash
git add -A
git commit -m "Final cleanup: multi-tier scraper refactor complete"
```
