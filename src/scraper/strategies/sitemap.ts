import type { SitemapDiscovery } from "../../pipeline/models.js";
import type { BrowserManager } from "../playwright.js";

// ---------------------------------------------------------------------------
// Sitemap discovery — fetch XML sitemap and extract product URLs
// ---------------------------------------------------------------------------

export interface DiscoveryResult {
  urls: string[];
}

/**
 * Fetch a sitemap XML, extract all <loc> URLs, and filter by regex patterns.
 */
export async function discoverFromSitemap(
  config: SitemapDiscovery,
  browser: BrowserManager,
): Promise<DiscoveryResult> {
  const page = await browser.goto(config.url);
  const content = await page.content();

  // Parse all <loc> tags from the XML
  const locRegex = /<loc>\s*(.*?)\s*<\/loc>/g;
  const urls: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = locRegex.exec(content)) !== null) {
    urls.push(match[1]);
  }

  // If filter patterns are provided, keep only URLs matching at least one
  if (config.filterPatterns.length > 0) {
    const regexes = config.filterPatterns.map((p) => new RegExp(p));
    return {
      urls: urls.filter((url) => regexes.some((re) => re.test(url))),
    };
  }

  return { urls };
}
