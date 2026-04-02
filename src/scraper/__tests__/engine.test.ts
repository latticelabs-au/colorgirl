import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SiteConfig } from "../../pipeline/models.js";
import type { BrowserManager } from "../playwright.js";
import { discoverFromSitemap } from "../strategies/sitemap.js";
import { discoverFromCategoryList } from "../strategies/category-list.js";
import { discoverFromPagination } from "../strategies/pagination.js";
import { discoverProducts } from "../strategies/index.js";
import { withRetry, scrape } from "../engine.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Create a mock page object with standard Playwright-like methods. */
function makeMockPage(overrides: Record<string, unknown> = {}) {
  return {
    content: vi.fn().mockResolvedValue(""),
    $: vi.fn().mockResolvedValue(null),
    $$eval: vi.fn().mockResolvedValue([]),
    goto: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Create a mock BrowserManager. */
function makeMockBrowser(
  pageOverrides: Record<string, unknown> = {},
): BrowserManager {
  const mockPage = makeMockPage(pageOverrides);
  return {
    launch: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(mockPage),
    page: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as BrowserManager;
}

/** Build a minimal SiteConfig for testing. */
function makeConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    name: "test-site",
    baseUrl: "https://example.com",
    discovery: { type: "sitemap", url: "https://example.com/sitemap.xml", filterPatterns: [] },
    selectors: {
      name: ".product-name",
      sku: ".product-sku",
      images: ".product-image img",
    },
    attributes: [],
    rateLimit: 0,
    variants: { type: "same-page" },
    pipeline: "http-direct",
    variantExtraction: { method: "visible-table", tableSelector: "table" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Sitemap discovery
// ---------------------------------------------------------------------------

describe("discoverFromSitemap", () => {
  it("extracts URLs from <loc> tags in XML content", async () => {
    const xml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/product-a</loc></url>
        <url><loc>https://example.com/product-b</loc></url>
        <url><loc>https://example.com/about</loc></url>
      </urlset>`;

    const mockPage = makeMockPage({ content: vi.fn().mockResolvedValue(xml) });
    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const result = await discoverFromSitemap(
      { type: "sitemap", url: "https://example.com/sitemap.xml", filterPatterns: [] },
      browser,
    );

    expect(result.urls).toEqual([
      "https://example.com/product-a",
      "https://example.com/product-b",
      "https://example.com/about",
    ]);
  });

  it("filters URLs by regex patterns", async () => {
    const xml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/product/trophy-a</loc></url>
        <url><loc>https://example.com/product/medal-b</loc></url>
        <url><loc>https://example.com/about</loc></url>
      </urlset>`;

    const mockPage = makeMockPage({ content: vi.fn().mockResolvedValue(xml) });
    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const result = await discoverFromSitemap(
      { type: "sitemap", url: "https://example.com/sitemap.xml", filterPatterns: ["/product/"] },
      browser,
    );

    expect(result.urls).toEqual([
      "https://example.com/product/trophy-a",
      "https://example.com/product/medal-b",
    ]);
  });

  it("returns empty array when XML has no <loc> tags", async () => {
    const xml = `<?xml version="1.0"?><urlset></urlset>`;

    const mockPage = makeMockPage({ content: vi.fn().mockResolvedValue(xml) });
    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const result = await discoverFromSitemap(
      { type: "sitemap", url: "https://example.com/sitemap.xml", filterPatterns: [] },
      browser,
    );

    expect(result.urls).toEqual([]);
  });

  it("handles whitespace inside <loc> tags", async () => {
    const xml = `<urlset><url><loc>
      https://example.com/product-a
    </loc></url></urlset>`;

    const mockPage = makeMockPage({ content: vi.fn().mockResolvedValue(xml) });
    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const result = await discoverFromSitemap(
      { type: "sitemap", url: "https://example.com/sitemap.xml", filterPatterns: [] },
      browser,
    );

    expect(result.urls).toHaveLength(1);
    expect(result.urls[0]).toBe("https://example.com/product-a");
  });
});

// ---------------------------------------------------------------------------
// Category-list discovery
// ---------------------------------------------------------------------------

describe("discoverFromCategoryList", () => {
  it("builds URLs from sections and categories and extracts links", async () => {
    const mockPage = makeMockPage({
      $$eval: vi.fn().mockResolvedValue([
        "https://example.com/trophies/dance/product-1",
        "https://example.com/trophies/dance/product-2",
      ]),
    });
    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const result = await discoverFromCategoryList(
      {
        type: "category-list",
        sections: [
          { name: "Trophies", path: "/trophies", categories: ["dance"] },
        ],
      },
      "https://example.com",
      browser,
    );

    expect(browser.goto).toHaveBeenCalledWith("https://example.com/trophies/dance");
    expect(result.urls).toEqual([
      "https://example.com/trophies/dance/product-1",
      "https://example.com/trophies/dance/product-2",
    ]);
  });

  it("deduplicates URLs across categories", async () => {
    const mockPage = makeMockPage({
      $$eval: vi.fn().mockResolvedValue([
        "https://example.com/product-shared",
        "https://example.com/product-shared",
      ]),
    });
    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const result = await discoverFromCategoryList(
      {
        type: "category-list",
        sections: [
          { name: "Trophies", path: "/trophies", categories: ["dance", "sports"] },
        ],
      },
      "https://example.com",
      browser,
    );

    // URL appears once despite appearing on both category pages
    expect(result.urls.filter((u) => u === "https://example.com/product-shared")).toHaveLength(1);
  });

  it("only keeps URLs under the base URL", async () => {
    const mockPage = makeMockPage({
      $$eval: vi.fn().mockResolvedValue([
        "https://example.com/product-1",
        "https://other-site.com/product-2",
      ]),
    });
    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const result = await discoverFromCategoryList(
      {
        type: "category-list",
        sections: [
          { name: "Trophies", path: "/trophies", categories: ["dance"] },
        ],
      },
      "https://example.com",
      browser,
    );

    expect(result.urls).toEqual(["https://example.com/product-1"]);
  });

  it("iterates multiple sections", async () => {
    let callCount = 0;
    const mockPage = makeMockPage({
      $$eval: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve([`https://example.com/product-${callCount}`]);
      }),
    });
    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const result = await discoverFromCategoryList(
      {
        type: "category-list",
        sections: [
          { name: "Trophies", path: "/trophies", categories: ["dance"] },
          { name: "Medals", path: "/medals", categories: ["sports"] },
        ],
      },
      "https://example.com",
      browser,
    );

    expect(browser.goto).toHaveBeenCalledTimes(2);
    expect(result.urls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Pagination discovery
// ---------------------------------------------------------------------------

describe("discoverFromPagination", () => {
  it("collects links from a single page with no next link", async () => {
    const mockPage = makeMockPage({
      $$eval: vi.fn().mockResolvedValue([
        "https://example.com/product-1",
        "https://example.com/product-2",
      ]),
      $: vi.fn().mockResolvedValue(null), // no next link
    });
    const browser = {
      ...makeMockBrowser(),
      page: vi.fn().mockResolvedValue(mockPage),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const result = await discoverFromPagination(
      { type: "pagination", listSelector: ".product-link", nextSelector: ".next-page" },
      browser,
    );

    expect(result.urls).toEqual([
      "https://example.com/product-1",
      "https://example.com/product-2",
    ]);
  });

  it("follows next-page links across multiple pages", async () => {
    let pageNum = 0;

    const mockNextElement = {
      getAttribute: vi.fn().mockReturnValue("https://example.com/page-2"),
    };

    const mockPage = makeMockPage({
      $$eval: vi.fn().mockImplementation(() => {
        pageNum++;
        return Promise.resolve([`https://example.com/product-${pageNum}`]);
      }),
      $: vi.fn()
        .mockResolvedValueOnce(mockNextElement) // first page has next
        .mockResolvedValueOnce(null),           // second page has no next
    });

    const browser = {
      ...makeMockBrowser(),
      page: vi.fn().mockResolvedValue(mockPage),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const result = await discoverFromPagination(
      { type: "pagination", listSelector: ".product-link", nextSelector: ".next-page" },
      browser,
    );

    expect(result.urls).toEqual([
      "https://example.com/product-1",
      "https://example.com/product-2",
    ]);
    expect(browser.goto).toHaveBeenCalledWith("https://example.com/page-2");
  });

  it("deduplicates product links across pages", async () => {
    const mockNextElement = {
      getAttribute: vi.fn().mockReturnValue("https://example.com/page-2"),
    };

    const mockPage = makeMockPage({
      $$eval: vi.fn()
        .mockResolvedValueOnce(["https://example.com/product-1", "https://example.com/product-2"])
        .mockResolvedValueOnce(["https://example.com/product-2", "https://example.com/product-3"]),
      $: vi.fn()
        .mockResolvedValueOnce(mockNextElement)
        .mockResolvedValueOnce(null),
    });

    const browser = {
      ...makeMockBrowser(),
      page: vi.fn().mockResolvedValue(mockPage),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const result = await discoverFromPagination(
      { type: "pagination", listSelector: ".product-link", nextSelector: ".next-page" },
      browser,
    );

    expect(result.urls).toEqual([
      "https://example.com/product-1",
      "https://example.com/product-2",
      "https://example.com/product-3",
    ]);
  });

  it("stops when next link element has no href", async () => {
    const mockNextNoHref = {
      getAttribute: vi.fn().mockReturnValue(null),
    };

    const mockPage = makeMockPage({
      $$eval: vi.fn().mockResolvedValue(["https://example.com/product-1"]),
      $: vi.fn().mockResolvedValue(mockNextNoHref),
    });

    const browser = {
      ...makeMockBrowser(),
      page: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const result = await discoverFromPagination(
      { type: "pagination", listSelector: ".product-link", nextSelector: ".next-page" },
      browser,
    );

    expect(result.urls).toEqual(["https://example.com/product-1"]);
  });
});

// ---------------------------------------------------------------------------
// Strategy dispatcher
// ---------------------------------------------------------------------------

describe("discoverProducts", () => {
  it("dispatches to sitemap strategy", async () => {
    const xml = `<urlset><url><loc>https://example.com/p1</loc></url></urlset>`;
    const mockPage = makeMockPage({ content: vi.fn().mockResolvedValue(xml) });
    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const config = makeConfig({
      discovery: {
        type: "sitemap",
        url: "https://example.com/sitemap.xml",
        filterPatterns: [],
      },
    });

    const result = await discoverProducts(config, browser);
    expect(result.urls).toEqual(["https://example.com/p1"]);
  });

  it("dispatches to category-list strategy", async () => {
    const mockPage = makeMockPage({
      $$eval: vi.fn().mockResolvedValue(["https://example.com/product-1"]),
    });
    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const config = makeConfig({
      discovery: {
        type: "category-list",
        sections: [{ name: "Trophies", path: "/trophies", categories: ["dance"] }],
      },
    });

    const result = await discoverProducts(config, browser);
    expect(result.urls).toEqual(["https://example.com/product-1"]);
  });

  it("dispatches to pagination strategy", async () => {
    const mockPage = makeMockPage({
      $$eval: vi.fn().mockResolvedValue(["https://example.com/product-1"]),
      $: vi.fn().mockResolvedValue(null),
    });
    const browser = {
      ...makeMockBrowser(),
      page: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const config = makeConfig({
      discovery: {
        type: "pagination",
        listSelector: ".product-link",
        nextSelector: ".next-page",
      },
    });

    const result = await discoverProducts(config, browser);
    expect(result.urls).toEqual(["https://example.com/product-1"]);
  });
});

// ---------------------------------------------------------------------------
// NOTE: extractProduct tests moved to extract-product.test.ts (HTML-based)
// and are covered by the Playwright pipeline tests for tier 3.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

describe("withRetry", () => {
  // Replace global setTimeout with a zero-delay version to avoid real waits
  // while keeping real timer infrastructure (avoids fake-timer unhandled rejection issues)
  let origSetTimeout: typeof globalThis.setTimeout;

  beforeEach(() => {
    origSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void) => origSetTimeout(fn, 0)) as typeof globalThis.setTimeout;
  });

  afterEach(() => {
    globalThis.setTimeout = origSetTimeout;
  });

  it("returns the result when the function succeeds on the first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await withRetry(fn, 3);

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries and succeeds after transient failures", async () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts <= 2) throw new Error(attempts === 1 ? "503" : "429");
      return "recovered";
    });

    const result = await withRetry(fn, 3);

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last error when all retries are exhausted", async () => {
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      throw new Error(`fail-${attempt}`);
    });

    await expect(withRetry(fn, 3)).rejects.toThrow("fail-4");
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it("respects custom maxRetries", async () => {
    const fn = vi.fn().mockImplementation(async () => {
      throw new Error("always fails");
    });

    await expect(withRetry(fn, 1)).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });

  it("calls the function more times with higher maxRetries", async () => {
    const fn = vi.fn().mockImplementation(async () => {
      throw new Error("nope");
    });

    await expect(withRetry(fn, 4)).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(5); // 1 + 4 retries
  });

  it("succeeds immediately without retries when function does not throw", async () => {
    const fn = vi.fn().mockResolvedValue(42);

    const result = await withRetry(fn, 5);

    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// scrape — dispatch-based engine
// ---------------------------------------------------------------------------

vi.mock("../http-client.js", () => ({
  createHttpClient: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(""),
    getRaw: vi.fn().mockResolvedValue(Buffer.from("")),
  }),
}));

import { createHttpClient } from "../http-client.js";

describe("scrape", () => {
  it("dispatches to sitemap-http pipeline for sitemap-http config", async () => {
    const sitemapXml = `<urlset>
      <url><loc>https://example.com/product-1</loc></url>
    </urlset>`;

    const productHtml = `
      <h1 class="product-name">Trophy</h1>
      <span class="product-sku">SKU-1</span>
      <div><img class="product-image" src="https://example.com/img.jpg"></div>`;

    const mockGet = vi.fn()
      .mockResolvedValueOnce(sitemapXml)
      .mockResolvedValueOnce(productHtml);

    (createHttpClient as any).mockReturnValue({ get: mockGet, getRaw: vi.fn() });

    const config = makeConfig({
      pipeline: "sitemap-http",
      discovery: {
        type: "sitemap",
        url: "https://example.com/sitemap.xml",
        filterPatterns: [],
      },
      selectors: {
        name: ".product-name",
        sku: ".product-sku",
        images: ".product-image",
      },
    });

    const result = await scrape({ config });
    expect(result.products).toHaveLength(1);
    expect(result.products[0].sku).toBe("SKU-1");
  });

  it("dispatches to http-direct pipeline for http-direct config", async () => {
    const categoryHtml = `<a href="https://example.com/product-1">P1</a>`;
    const productHtml = `
      <h1 class="product-name">Trophy</h1>
      <span class="product-sku">SKU-1</span>
      <div><img class="product-image" src="https://example.com/img.jpg"></div>`;

    const mockGet = vi.fn()
      .mockResolvedValueOnce(categoryHtml)
      .mockResolvedValueOnce(categoryHtml) // pagination check
      .mockResolvedValueOnce(productHtml);

    (createHttpClient as any).mockReturnValue({ get: mockGet, getRaw: vi.fn() });

    const config = makeConfig({
      pipeline: "http-direct",
      discovery: {
        type: "category-list",
        sections: [{ name: "Trophies", path: "/trophies", categories: ["dance"] }],
      },
      selectors: {
        name: ".product-name",
        sku: ".product-sku",
        images: ".product-image",
      },
    });

    const result = await scrape({ config });
    expect(result.products.length).toBeGreaterThanOrEqual(1);
  });

  it("throws for unknown pipeline type", async () => {
    const config = makeConfig({ pipeline: "unknown" as any });
    await expect(scrape({ config })).rejects.toThrow("Unknown pipeline");
  });
});
