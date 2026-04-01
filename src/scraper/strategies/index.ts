import type { SiteConfig } from "../../pipeline/models.js";
import type { BrowserManager } from "../playwright.js";
import { discoverFromSitemap, type DiscoveryResult } from "./sitemap.js";
import { discoverFromCategoryList } from "./category-list.js";
import { discoverFromPagination } from "./pagination.js";

export type { DiscoveryResult };

// ---------------------------------------------------------------------------
// Strategy dispatcher — route to the correct discovery implementation
// ---------------------------------------------------------------------------

/**
 * Discover product URLs using the strategy defined in the site config.
 */
export async function discoverProducts(
  config: SiteConfig,
  browser: BrowserManager,
): Promise<DiscoveryResult> {
  switch (config.discovery.type) {
    case "sitemap":
      return discoverFromSitemap(config.discovery, browser);

    case "category-list":
      return discoverFromCategoryList(config.discovery, config.baseUrl, browser);

    case "pagination":
      return discoverFromPagination(config.discovery, browser);

    default: {
      // Exhaustiveness check — TypeScript will error if a case is missed
      const _exhaustive: never = config.discovery;
      throw new Error(`Unknown discovery strategy: ${(_exhaustive as any).type}`);
    }
  }
}
