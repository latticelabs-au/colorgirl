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
            break;
          }
          page++;
        }
      }
    }
  } else if (disc.type === "pagination") {
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
        const links = parsed.allAttr("a", "href");
        for (const link of links) {
          if (link) urls.add(link);
        }
        currentUrl = parsed.$(disc.nextSelector).attr("href") ?? null;
      } catch {
        break;
      }
    }
  }

  return [...urls];
}
