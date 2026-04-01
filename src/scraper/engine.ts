import type { SiteConfig, RawProduct } from "../pipeline/models.js";
import type { BrowserManager } from "./playwright.js";
import { discoverProducts } from "./strategies/index.js";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ScrapeOptions {
  config: SiteConfig;
  /** Optional subset of categories to scrape */
  categories?: string[];
  /** Progress callback invoked during discovery and scraping */
  onProgress?: (progress: ScrapeProgress) => void;
}

export interface ScrapeProgress {
  phase: "discovering" | "scraping";
  current: number;
  total: number;
  currentUrl?: string;
}

export interface ScrapeResult {
  products: RawProduct[];
  errors: ScrapeError[];
}

export interface ScrapeError {
  url: string;
  error: string;
  retries: number;
}

// ---------------------------------------------------------------------------
// Retry helper — exponential backoff
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Execute an async function with exponential backoff retry.
 * Retries on 429 (rate limited) and 503 (service unavailable) errors,
 * and on generic failures up to MAX_RETRIES times.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;

      // Exponential backoff: 1s, 2s, 4s
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Product extraction
// ---------------------------------------------------------------------------

/**
 * Extract a RawProduct from the current page using the site's CSS selectors.
 */
export async function extractProduct(
  url: string,
  config: SiteConfig,
  browser: BrowserManager,
): Promise<RawProduct> {
  const page = await browser.goto(url);
  const selectors = config.selectors;

  // Required fields
  const name = await textContent(page, selectors.name);
  const sku = await textContent(page, selectors.sku);

  if (!name) {
    throw new Error(`Missing product name at ${url}`);
  }
  if (!sku) {
    throw new Error(`Missing product SKU at ${url}`);
  }

  // Images — collect all src attributes from matching elements
  const images = await page.$$eval(selectors.images, (els: Element[]) =>
    els
      .map((el) => {
        if (el instanceof HTMLImageElement) return el.src;
        if (el instanceof HTMLAnchorElement) return el.href;
        return el.getAttribute("src") ?? el.getAttribute("href") ?? "";
      })
      .filter((src) => src !== ""),
  );

  // Optional text fields
  const description = selectors.description
    ? await optionalText(page, selectors.description)
    : undefined;

  const shortDescription = selectors.shortDescription
    ? await optionalText(page, selectors.shortDescription)
    : undefined;

  // Price
  let price: number | undefined;
  if (selectors.price) {
    const priceText = await optionalText(page, selectors.price);
    if (priceText) {
      const parsed = parseFloat(priceText.replace(/[^0-9.]/g, ""));
      if (!isNaN(parsed)) price = parsed;
    }
  }

  // Dimensions
  const weight = selectors.weight
    ? await optionalNumber(page, selectors.weight)
    : undefined;
  const width = selectors.width
    ? await optionalNumber(page, selectors.width)
    : undefined;
  const height = selectors.height
    ? await optionalNumber(page, selectors.height)
    : undefined;

  const dimensions =
    weight !== undefined || width !== undefined || height !== undefined
      ? { weight, width, height }
      : undefined;

  // Category breadcrumb
  const categoryPath: string[] = [];
  if (selectors.categoryBreadcrumb) {
    const crumbs = await page.$$eval(
      selectors.categoryBreadcrumb,
      (els: Element[]) => els.map((el) => (el.textContent ?? "").trim()),
    );
    categoryPath.push(...crumbs.filter((c) => c.length > 0));
  }

  // Extra attributes
  const attributes: Record<string, string> = {};
  if (selectors.extra) {
    for (const [slug, selector] of Object.entries(selectors.extra)) {
      const value = await optionalText(page, selector);
      if (value) attributes[slug] = value;
    }
  }

  return {
    sku,
    name,
    sourceUrl: url,
    categoryPath,
    attributes,
    price,
    images,
    dimensions,
    description,
    shortDescription,
    scrapedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main scrape orchestrator
// ---------------------------------------------------------------------------

/**
 * Full scrape pipeline: discover product URLs, then extract each product
 * with retry logic. Reports progress via optional callback.
 */
export async function scrape(
  options: ScrapeOptions,
  browser: BrowserManager,
): Promise<ScrapeResult> {
  const { config, onProgress } = options;
  const products: RawProduct[] = [];
  const errors: ScrapeError[] = [];

  try {
    // Phase 1: Discovery (with retry)
    onProgress?.({ phase: "discovering", current: 0, total: 0 });

    const { urls } = await withRetry(
      () => discoverProducts(config, browser),
      MAX_RETRIES,
    );

    // Filter by categories if specified
    let targetUrls = urls;
    if (options.categories && options.categories.length > 0) {
      const cats = options.categories.map((c) => c.toLowerCase());
      targetUrls = urls.filter((url) => {
        const lower = url.toLowerCase();
        return cats.some((cat) => lower.includes(cat));
      });
    }

    // Phase 2: Scrape each product URL
    const total = targetUrls.length;

    for (let i = 0; i < total; i++) {
      const url = targetUrls[i];
      onProgress?.({ phase: "scraping", current: i + 1, total, currentUrl: url });

      let retries = 0;
      try {
        const product = await withRetry(
          () => extractProduct(url, config, browser),
          MAX_RETRIES,
        );
        products.push(product);
      } catch (err) {
        retries = MAX_RETRIES;
        errors.push({
          url,
          error: err instanceof Error ? err.message : String(err),
          retries,
        });
      }
    }
  } finally {
    await browser.close();
  }

  return { products, errors };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function textContent(page: any, selector: string): Promise<string> {
  const el = await page.$(selector);
  if (!el) return "";
  const text = await el.textContent();
  return (text ?? "").trim();
}

async function optionalText(
  page: any,
  selector: string,
): Promise<string | undefined> {
  const text = await textContent(page, selector);
  return text || undefined;
}

async function optionalNumber(
  page: any,
  selector: string,
): Promise<number | undefined> {
  const text = await textContent(page, selector);
  if (!text) return undefined;
  const parsed = parseFloat(text.replace(/[^0-9.]/g, ""));
  return isNaN(parsed) ? undefined : parsed;
}
