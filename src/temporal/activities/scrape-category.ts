import { scrape } from "../../scraper/engine.js";
import type { SiteConfig, RawProduct } from "../../pipeline/models.js";
import type { ScrapeError } from "../../scraper/engine.js";

export interface ScrapeCategoryResult {
  products: RawProduct[];
  errors: ScrapeError[];
}

/** Temporal activity: scrape products from a specific category */
export async function scrapeCategoryActivity(
  config: SiteConfig,
  category?: string,
): Promise<ScrapeCategoryResult> {
  return scrape({
    config,
    categories: category ? [category] : undefined,
  });
}
