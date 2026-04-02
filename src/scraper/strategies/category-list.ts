import type { CategoryListDiscovery } from "../../pipeline/models.js";
import type { BrowserManager } from "../playwright.js";
import type { DiscoveryResult } from "./sitemap.js";

// ---------------------------------------------------------------------------
// Category-list discovery — iterate sections, build URLs, extract links
// ---------------------------------------------------------------------------

/**
 * Iterate category-list sections, navigate to each category page,
 * and extract product links using the configured selector/pattern.
 */
export async function discoverFromCategoryList(
  config: CategoryListDiscovery,
  baseUrl: string,
  browser: BrowserManager,
): Promise<DiscoveryResult> {
  const urlSet = new Set<string>();
  const linkSelector = config.productLinkSelector ?? "a[href]";
  const urlPattern = config.productUrlPattern
    ? new RegExp(config.productUrlPattern)
    : null;

  for (const section of config.sections) {
    for (const category of section.categories) {
      const categoryUrl = `${baseUrl}${section.path}/${category}`;
      const page = await browser.goto(categoryUrl);

      const links = await page.$$eval(linkSelector, (anchors: HTMLAnchorElement[]) =>
        anchors.map((a) => a.href),
      );

      for (const link of links) {
        if (!link.startsWith(baseUrl)) continue;
        if (link === categoryUrl) continue;
        if (urlPattern && !urlPattern.test(link)) continue;
        urlSet.add(link);
      }
    }
  }

  return { urls: [...urlSet] };
}
