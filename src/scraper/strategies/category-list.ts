import type { CategoryListDiscovery } from "../../pipeline/models.js";
import type { BrowserManager } from "../playwright.js";
import type { DiscoveryResult } from "./sitemap.js";

// ---------------------------------------------------------------------------
// Category-list discovery — iterate sections, build URLs, extract links
// ---------------------------------------------------------------------------

/**
 * Iterate category-list sections, navigate to each category page,
 * and extract all product links found via <a> tags.
 */
export async function discoverFromCategoryList(
  config: CategoryListDiscovery,
  baseUrl: string,
  browser: BrowserManager,
): Promise<DiscoveryResult> {
  const urls: string[] = [];

  for (const section of config.sections) {
    for (const category of section.categories) {
      const categoryUrl = `${baseUrl}${section.path}/${category}`;
      const page = await browser.goto(categoryUrl);

      // Extract all anchor href values on the category page
      const links = await page.$$eval("a[href]", (anchors: HTMLAnchorElement[]) =>
        anchors.map((a) => a.href),
      );

      // Only keep links that are under the same base URL
      for (const link of links) {
        if (link.startsWith(baseUrl) && !urls.includes(link)) {
          urls.push(link);
        }
      }
    }
  }

  return { urls };
}
