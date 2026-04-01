import type { PaginationDiscovery } from "../../pipeline/models.js";
import type { BrowserManager } from "../playwright.js";
import type { DiscoveryResult } from "./sitemap.js";

// ---------------------------------------------------------------------------
// Pagination discovery — follow next-page links collecting product URLs
// ---------------------------------------------------------------------------

/**
 * Starting from the current page, collect product links via listSelector,
 * then follow next-page links via nextSelector until no more pages exist.
 */
const MAX_PAGES = 500;

export async function discoverFromPagination(
  config: PaginationDiscovery,
  browser: BrowserManager,
): Promise<DiscoveryResult> {
  const urlSet = new Set<string>();
  const visitedPages = new Set<string>();
  let hasNext = true;
  let pageCount = 0;

  while (hasNext && pageCount < MAX_PAGES) {
    pageCount++;
    const page = await browser.page();

    // Extract product links from the current listing page
    const links = await page.$$eval(
      config.listSelector,
      (els: HTMLAnchorElement[]) => els.map((el) => el.href),
    );

    for (const link of links) {
      urlSet.add(link);
    }

    // Check for and follow a next-page link
    const nextLink = await page.$(config.nextSelector);
    if (nextLink) {
      const nextHref = await nextLink.getAttribute("href");
      if (nextHref && !visitedPages.has(nextHref)) {
        visitedPages.add(nextHref);
        await browser.goto(nextHref);
      } else {
        hasNext = false;
      }
    } else {
      hasNext = false;
    }
  }

  return { urls: [...urlSet] };
}
