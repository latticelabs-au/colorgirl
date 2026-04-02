import { gunzipSync } from "node:zlib";
import type { SiteConfig, RawProduct, SitemapDiscovery } from "../../pipeline/models.js";
import type { ScrapeResult, ScrapeError, ScrapeProgress } from "../engine.js";
import { createHttpClient } from "../http-client.js";
import { extractProductsFromHtml } from "../extract-product.js";
import { withRetry } from "../engine.js";

/**
 * Tier 2: Sitemap + HTTP Pipeline.
 * Fetches sitemap.xml -> extracts product URLs -> fetches each with HTTP -> parses with cheerio.
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
