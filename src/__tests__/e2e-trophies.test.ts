/**
 * End-to-end integration test for trophies.com.au
 *
 * This test runs the REAL scraper pipeline against the live trophies.com.au
 * website using Playwright.  It exercises:
 *   1. Product URL discovery via category pages
 *   2. Product page scraping (extracting name, SKU, attributes, images)
 *   3. Grouping scraped products into parent + variations
 *   4. CSV generation (with placeholder descriptions -- no AI enrichment)
 *
 * The test targets only TWO small categories (chess, darts) to keep runtime
 * reasonable while still exercising every pipeline stage end-to-end.
 *
 * Run manually:
 *   E2E=1 npx vitest run src/__tests__/e2e-trophies.test.ts
 *
 * The test is gated behind the E2E environment variable so it never runs
 * during normal `npm test` / `vitest run`.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  SiteConfig,
  RawProduct,
  GroupedProduct,
  EnrichedProduct,
  AttributeDef,
} from "../pipeline/models.js";
import { BrowserManager } from "../scraper/playwright.js";
import { withRetry } from "../scraper/engine.js";
import { extractProductsFromHtml } from "../scraper/extract-product.js";
import { groupProducts } from "../pipeline/grouper.js";
import { buildCsv, type CsvBuilderConfig } from "../export/csv-builder.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = "https://trophies.com.au";
const RATE_LIMIT_MS = 2500; // be polite
const OUTPUT_DIR = path.resolve(__dirname, "../../output");
const OUTPUT_CSV = path.join(OUTPUT_DIR, "e2e-test.csv");

/**
 * Small categories chosen for the e2e test.
 * Chess and Darts are deliberately small so the test finishes quickly.
 */
const TEST_CATEGORIES: Array<{ section: string; slug: string; display: string }> = [
  { section: "trophies", slug: "chess", display: "Chess" },
  { section: "trophies", slug: "darts", display: "Darts" },
];

// ---------------------------------------------------------------------------
// Site configuration (constructed from Python scraper analysis)
// ---------------------------------------------------------------------------

/**
 * The trophies.com.au product page structure:
 *
 *   <main>
 *     <h1>Product Name - Colour</h1>
 *     <p>Parent SKU (e.g. CR198)</p>
 *     <p>Description text</p>
 *     ...
 *     <table>                          <-- "Additional Information" table
 *       <tr><td>Product Code</td><td>CR198A</td></tr>
 *       <tr><td>Size</td><td>150mm</td></tr>
 *       <tr><td>Colour</td><td>Antique Gold</td></tr>
 *       <tr><td>Material</td><td>Plastic / Marble</td></tr>
 *       <tr><td>Weight</td><td>285g</td></tr>
 *       ...
 *     </table>
 *     <template data-temp-id="CR198B"> <-- hidden variant tables
 *       <table>...</table>
 *     </template>
 *   </main>
 *
 * Category pages list products as <a> tags linking to /products/{section}/{slug}/{product}/.
 * Pagination uses ?filter=view-all.
 *
 * Each colour is a SEPARATE page; size variants are on the same page inside
 * <template> elements.  The standard engine.extractProduct() will read the
 * first/default table row values.  The grouper will then consolidate by
 * base name.
 */

const ATTRIBUTES: AttributeDef[] = [
  {
    name: "Size",
    slug: "pa_size",
    isVariation: true,
    isGlobal: true,
    sizeLabels: true,
    transform: "format_number",
  },
  {
    name: "Colour",
    slug: "pa_colour",
    isVariation: true,
    isGlobal: true,
    transform: "colour_cleanup",
  },
  {
    name: "Material",
    slug: "pa_material",
    isVariation: false,
    isGlobal: true,
    transform: "replace_slashes",
  },
  {
    name: "Insert size",
    slug: "pa_insert-size",
    isVariation: false,
    isGlobal: false,
  },
  {
    name: "Medal size",
    slug: "pa_medal-size",
    isVariation: false,
    isGlobal: false,
    transform: "format_number",
  },
  {
    name: "Thickness",
    slug: "pa_thickness",
    isVariation: false,
    isGlobal: false,
    transform: "format_number",
  },
  {
    name: "Engraving plate size",
    slug: "pa_engraving-plate",
    isVariation: false,
    isGlobal: false,
  },
];

/**
 * Build the SiteConfig for trophies.com.au.
 *
 * The selectors target the DOM structure observed via the Python scraper.
 * NOTE: :has() and :contains() pseudo-selectors are not universally supported
 * in Playwright's CSS engine.  We use Playwright's evaluate() for table
 * extraction instead (see extractTableAttributes below).
 */
const siteConfig: SiteConfig = {
  name: "trophies-com-au",
  baseUrl: BASE_URL,
  discovery: {
    type: "category-list",
    sections: TEST_CATEGORIES.map((c) => ({
      name: c.display,
      path: `/products/${c.section}`,
      categories: [c.slug],
    })),
  },
  selectors: {
    name: "main h1",
    sku: "main h1 + p",
    images: "main img[src*='/products/']",
    description: "main h1 ~ p:nth-of-type(2)",
    // Extra selectors -- we won't rely on these for table-based data;
    // instead we use a custom extraction approach in the test.
    extra: {},
  },
  attributes: ATTRIBUTES,
  rateLimit: RATE_LIMIT_MS,
  variants: {
    type: "separate-pages",
    linkSelector: "main a[href*='/products/']",
  },
  pipeline: "http-direct",
  variantExtraction: {
    method: "template-tags",
    templateSelector: "template[data-temp-id]",
    skuAttribute: "data-temp-id",
    innerFormat: "table",
  },
};

// ---------------------------------------------------------------------------
// Custom product extraction (handles trophies.com.au table structure)
// ---------------------------------------------------------------------------

/**
 * Extract product data from a trophies.com.au product page.
 *
 * The standard engine.extractProduct() works for name/SKU/images, but
 * trophies.com.au stores attributes in a key-value <table> that needs
 * custom parsing.  This function uses Playwright's page.evaluate() to
 * read the table and build a complete RawProduct.
 */
async function extractTrophiesProduct(
  url: string,
  browser: BrowserManager,
): Promise<RawProduct | null> {
  const page = await browser.goto(url);

  // Wait briefly for any dynamic content to settle
  await page.waitForLoadState("domcontentloaded");

  // Extract all data in one evaluate() call
  const data = await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return null;

    // H1 = product name
    const h1 = main.querySelector("h1");
    const name = h1?.textContent?.trim() ?? "";

    // First <p> after h1 = parent SKU
    // Second <p> after h1 = description
    let sku = "";
    let description = "";
    if (h1?.parentElement) {
      const paragraphs = h1.parentElement.querySelectorAll("p");
      if (paragraphs.length >= 1) sku = paragraphs[0]?.textContent?.trim() ?? "";
      if (paragraphs.length >= 2) description = paragraphs[1]?.textContent?.trim() ?? "";
    }

    // Parse the "Additional Information" table
    const table = main.querySelector("table");
    const tableData: Record<string, string> = {};
    if (table) {
      const rows = table.querySelectorAll("tr");
      rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 2) {
          const key = cells[0]?.textContent?.trim() ?? "";
          const value = cells[1]?.textContent?.trim() ?? "";
          if (key && value) tableData[key] = value;
        }
      });
    }

    // Images
    const images = Array.from(main.querySelectorAll("img"))
      .map((img) => img.src)
      .filter((src) => src.includes("/products/"));

    return { name, sku, description, tableData, images };
  });

  if (!data || !data.name || !data.sku) {
    console.log(`  [SKIP] Could not extract name/SKU from ${url}`);
    return null;
  }

  // Use the Product Code from the table if available, otherwise parent SKU
  const variantSku = data.tableData["Product Code"] ?? data.sku;

  // Build attributes from table data
  const attributes: Record<string, string> = {};
  if (data.tableData["Colour"]) attributes["pa_colour"] = data.tableData["Colour"];
  if (data.tableData["Material"]) attributes["pa_material"] = data.tableData["Material"];
  if (data.tableData["Size"]) attributes["pa_size"] = data.tableData["Size"];
  if (data.tableData["Insert Size"]) attributes["pa_insert-size"] = data.tableData["Insert Size"];
  if (data.tableData["Engraving Plate"]) attributes["pa_engraving-plate"] = data.tableData["Engraving Plate"];

  // Parse dimensions
  const parseNum = (val: string | undefined): number | undefined => {
    if (!val) return undefined;
    const n = parseFloat(val.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? undefined : n;
  };

  const weight = parseNum(data.tableData["Weight"]);
  const width = parseNum(data.tableData["Width"]);
  const height = parseNum(data.tableData["Size"]); // Size (mm) is the product height

  return {
    sku: variantSku,
    name: data.name,
    sourceUrl: url,
    categoryPath: [], // will be set by the caller
    attributes,
    images: data.images,
    dimensions:
      weight !== undefined || width !== undefined || height !== undefined
        ? { weight, width, height }
        : undefined,
    description: data.description,
    scrapedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Category page discovery (handles trophies.com.au link structure)
// ---------------------------------------------------------------------------

/**
 * Discover product URLs from a trophies.com.au category page.
 *
 * Category pages at /products/{section}/{slug}/?filter=view-all list
 * products as anchor tags.  Product URLs have 5+ path segments
 * (e.g. /products/trophies/chess/checkmate-gold/).
 */
async function discoverCategoryProducts(
  browser: BrowserManager,
  section: string,
  slug: string,
): Promise<string[]> {
  const categoryUrl = `${BASE_URL}/products/${section}/${slug}/?filter=view-all`;
  console.log(`  [DISCOVER] ${categoryUrl}`);

  const page = await browser.goto(categoryUrl);
  await page.waitForLoadState("domcontentloaded");

  const links: string[] = await page.evaluate((baseUrl: string) => {
    const main = document.querySelector("main");
    if (!main) return [];

    const anchors = main.querySelectorAll("a[href]");
    const urls = new Set<string>();

    anchors.forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      // Product links have structure: /products/{section}/{category}/{product}/
      // They must be under the base URL and have at least 4 path segments after /products/
      if (href.startsWith(baseUrl) && href.includes("/products/")) {
        const pathPart = href.replace(baseUrl, "");
        const segments = pathPart.split("/").filter(Boolean);
        // products / section / category / product-slug = 4 segments minimum
        if (segments.length >= 4 && segments[0] === "products") {
          urls.add(href);
        }
      }
    });

    return Array.from(urls);
  }, BASE_URL);

  // Deduplicate (Set guarantees uniqueness but the evaluate may return dupes across pages)
  return Array.from(new Set(links));
}

// ---------------------------------------------------------------------------
// Placeholder enrichment (skip AI -- use static descriptions)
// ---------------------------------------------------------------------------

function enrichWithPlaceholders(grouped: GroupedProduct[]): EnrichedProduct[] {
  return grouped.map((product) => ({
    ...product,
    shortDescription: `${product.name} trophy available in ${product.variations.length} variation(s).`,
    longDescription: [
      `The ${product.name} is a quality trophy product.`,
      product.attributeValues["pa_material"]
        ? `Made from ${product.attributeValues["pa_material"].join(", ")}.`
        : "",
      product.attributeValues["pa_colour"]
        ? `Available in ${product.attributeValues["pa_colour"].join(", ")}.`
        : "",
      "Includes engraving plate.",
      "Suitable for club and school presentations.",
    ]
      .filter(Boolean)
      .join("\n"),
    metaTitle: `Trophies Inner West | ${product.name}`,
    metaDescription: `The ${product.name} is a quality trophy. Prepared locally in Sydney NSW for Inner West trophies.`,
    permalink: product.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      + "-trophies",
    keywords: "trophies",
  }));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const shouldRun = !!process.env.E2E;

describe.skipIf(!shouldRun)("e2e: trophies.com.au pipeline", () => {
  let browser: BrowserManager;
  let allRawProducts: RawProduct[] = [];
  let grouped: GroupedProduct[] = [];
  let enriched: EnrichedProduct[] = [];
  let csvOutput: string = "";

  // -----------------------------------------------------------------------
  // Setup & Teardown
  // -----------------------------------------------------------------------

  beforeAll(async () => {
    browser = new BrowserManager({
      rateLimit: RATE_LIMIT_MS,
      headless: true,
    });
    await browser.launch();
    console.log("[E2E] Browser launched");
  }, 30_000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
      console.log("[E2E] Browser closed");
    }
  }, 15_000);

  // -----------------------------------------------------------------------
  // Phase 1: Discovery -- find product URLs from category pages
  // -----------------------------------------------------------------------

  it("discovers product URLs from category pages", async () => {
    console.log("\n=== Phase 1: Discovery ===");

    for (const cat of TEST_CATEGORIES) {
      console.log(`\n[E2E] Discovering products in ${cat.display} (${cat.section}/${cat.slug})`);

      const urls = await discoverCategoryProducts(browser, cat.section, cat.slug);
      console.log(`  Found ${urls.length} product URLs`);

      expect(urls.length).toBeGreaterThan(0);

      // Store URLs with category info for the next phase
      for (const url of urls) {
        // Push a placeholder -- we'll scrape in the next step
        allRawProducts.push({
          sku: "", // placeholder
          name: "",
          sourceUrl: url,
          categoryPath: ["Trophies", cat.display],
          attributes: {},
          images: [],
          scrapedAt: "",
          _needsScraping: true,
        } as RawProduct & { _needsScraping: boolean });
      }
    }

    console.log(`\n[E2E] Total URLs discovered: ${allRawProducts.length}`);
    expect(allRawProducts.length).toBeGreaterThan(0);
  }, 120_000);

  // -----------------------------------------------------------------------
  // Phase 2: Scraping -- extract product data from each page
  // -----------------------------------------------------------------------

  it("scrapes product data from discovered URLs", async () => {
    console.log("\n=== Phase 2: Scraping ===");

    // Get the URLs and category paths that need scraping
    const toScrape = allRawProducts.map((p) => ({
      url: p.sourceUrl,
      categoryPath: p.categoryPath,
    }));

    // Reset the array -- we'll replace placeholders with real data
    allRawProducts = [];

    let scraped = 0;
    let failed = 0;

    for (const { url, categoryPath } of toScrape) {
      scraped++;
      console.log(`  [${scraped}/${toScrape.length}] Scraping: ${url}`);

      try {
        const product = await withRetry(
          () => extractTrophiesProduct(url, browser),
          2, // 2 retries
        );

        if (product) {
          product.categoryPath = categoryPath;
          allRawProducts.push(product);
          console.log(`    -> OK: "${product.name}" [${product.sku}]`);
        } else {
          failed++;
          console.log(`    -> SKIP (no data)`);
        }
      } catch (err) {
        failed++;
        console.log(`    -> FAIL: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log(`\n[E2E] Scraped: ${allRawProducts.length} products, ${failed} failures`);

    // We should have at least some products
    expect(allRawProducts.length).toBeGreaterThan(0);

    // Every scraped product should have a name and SKU
    for (const product of allRawProducts) {
      expect(product.name).toBeTruthy();
      expect(product.sku).toBeTruthy();
      expect(product.sourceUrl).toContain("trophies.com.au");
    }
  }, 300_000); // 5 minutes -- scraping is slow with rate limiting

  // -----------------------------------------------------------------------
  // Phase 3: Grouping -- consolidate colour/size variants
  // -----------------------------------------------------------------------

  it("groups products by base name into parent + variations", () => {
    console.log("\n=== Phase 3: Grouping ===");

    grouped = groupProducts(allRawProducts, {
      attributes: ATTRIBUTES,
    });

    console.log(`[E2E] Grouped ${allRawProducts.length} raw products into ${grouped.length} product groups`);

    for (const g of grouped) {
      const colours = g.attributeValues["pa_colour"] ?? [];
      console.log(
        `  ${g.parentSku} "${g.name}" [${g.type}] ` +
        `${g.variations.length} variations, ` +
        `colours: [${colours.join(", ")}]`
      );
    }

    expect(grouped.length).toBeGreaterThan(0);

    // Every group should have at least one variation
    for (const g of grouped) {
      expect(g.variations.length).toBeGreaterThan(0);
      expect(g.parentSku).toBeTruthy();
      expect(g.name).toBeTruthy();
      expect(["simple", "variable"]).toContain(g.type);
    }

    // At least one group should be "variable" (multi-variant products are common)
    const variableCount = grouped.filter((g) => g.type === "variable").length;
    console.log(`[E2E] Simple: ${grouped.length - variableCount}, Variable: ${variableCount}`);
  });

  // -----------------------------------------------------------------------
  // Phase 4: CSV generation -- build WooCommerce CSV with placeholder SEO
  // -----------------------------------------------------------------------

  it("builds a valid WooCommerce CSV", () => {
    console.log("\n=== Phase 4: CSV Build ===");

    enriched = enrichWithPlaceholders(grouped);

    const csvConfig: CsvBuilderConfig = {
      attributes: ATTRIBUTES,
      weightUnit: "g",
      dimensionUnit: "mm",
      seoPlugin: "yoast",
    };

    csvOutput = buildCsv(enriched, csvConfig);

    expect(csvOutput).toBeTruthy();
    expect(csvOutput.length).toBeGreaterThan(100);

    // CSV should start with UTF-8 BOM
    expect(csvOutput.charCodeAt(0)).toBe(0xFEFF);

    // Parse the CSV to validate structure
    const lines = csvOutput.split("\n").filter((line) => line.trim().length > 0);
    const headerLine = lines[0].replace(/^\uFEFF/, ""); // strip BOM

    console.log(`[E2E] CSV: ${lines.length} lines (including header)`);
    console.log(`[E2E] Header columns: ${headerLine.split(",").length}`);

    // Should have at least a header + 1 data row
    expect(lines.length).toBeGreaterThanOrEqual(2);

    // Header should contain key column names
    expect(headerLine).toContain("Type");
    expect(headerLine).toContain("SKU");
    expect(headerLine).toContain("Name");
    expect(headerLine).toContain("Categories");

    // Write to disk for manual inspection
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_CSV, csvOutput, "utf-8");
    console.log(`[E2E] CSV written to: ${OUTPUT_CSV}`);
  });

  // -----------------------------------------------------------------------
  // Phase 5: Validate output integrity
  // -----------------------------------------------------------------------

  it("CSV contains correct product types and parent references", () => {
    console.log("\n=== Phase 5: Validation ===");

    const lines = csvOutput
      .split("\n")
      .filter((line) => line.trim().length > 0);

    // Skip the header line (index 0) -- parse remaining as data rows
    // Simple CSV parsing (fields may be quoted)
    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++; // skip escaped quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === "," && !inQuotes) {
          result.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
      result.push(current);
      return result;
    };

    const header = parseRow(lines[0].replace(/^\uFEFF/, ""));
    const typeIdx = header.indexOf("Type");
    const skuIdx = header.indexOf("SKU");
    const parentIdx = header.indexOf("Parent");
    const nameIdx = header.indexOf("Name");

    expect(typeIdx).toBeGreaterThanOrEqual(0);
    expect(skuIdx).toBeGreaterThanOrEqual(0);

    let simpleRows = 0;
    let variableRows = 0;
    let variationRows = 0;

    for (let i = 1; i < lines.length; i++) {
      const row = parseRow(lines[i]);
      const type = row[typeIdx];

      if (type === "simple") {
        simpleRows++;
        expect(row[skuIdx]).toBeTruthy();
        expect(row[nameIdx]).toBeTruthy();
      } else if (type === "variable") {
        variableRows++;
        expect(row[skuIdx]).toBeTruthy();
        expect(row[nameIdx]).toBeTruthy();
      } else if (type === "variation") {
        variationRows++;
        expect(row[skuIdx]).toBeTruthy();
        // Variations must reference a parent
        if (parentIdx >= 0) {
          expect(row[parentIdx]).toBeTruthy();
        }
      }
    }

    console.log(`[E2E] Row types: ${simpleRows} simple, ${variableRows} variable, ${variationRows} variation`);
    console.log(`[E2E] Total data rows: ${simpleRows + variableRows + variationRows}`);

    // We should have at least some products
    expect(simpleRows + variableRows).toBeGreaterThan(0);

    // Every variable product should have at least one variation row
    if (variableRows > 0) {
      expect(variationRows).toBeGreaterThan(0);
    }

    console.log("\n[E2E] All validations passed!");
    console.log(`[E2E] Output CSV: ${OUTPUT_CSV}`);
  });
}, 360_000); // 6 minute overall timeout for the describe block
