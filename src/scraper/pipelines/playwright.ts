import type { SiteConfig, RawProduct } from "../../pipeline/models.js";
import type { ScrapeResult, ScrapeError, ScrapeProgress } from "../engine.js";
import { BrowserManager } from "../playwright.js";
import { discoverProducts } from "../strategies/index.js";
import { withRetry } from "../engine.js";

const MAX_RETRIES = 3;

/**
 * Tier 3: Playwright Pipeline (last resort).
 * Full browser automation for JS-rendered sites.
 * Very slow (~12 products/min), resource-intensive, and fragile.
 * Only use when HTTP tiers are genuinely impossible.
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

// ---------------------------------------------------------------------------
// Playwright-specific product extraction (moved from old engine.ts)
// ---------------------------------------------------------------------------

async function extractProductPlaywright(
  url: string,
  config: SiteConfig,
  browser: BrowserManager,
): Promise<RawProduct> {
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
