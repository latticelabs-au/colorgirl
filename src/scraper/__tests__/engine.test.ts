import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SiteConfig } from "../../pipeline/models.js";
import type { BrowserManager } from "../playwright.js";
import { discoverFromSitemap } from "../strategies/sitemap.js";
import { discoverFromCategoryList } from "../strategies/category-list.js";
import { discoverFromPagination } from "../strategies/pagination.js";
import { discoverProducts } from "../strategies/index.js";
import { extractProduct, withRetry, scrape } from "../engine.js";

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
// extractProduct
// ---------------------------------------------------------------------------

describe("extractProduct", () => {
  it("extracts name, sku, and images from page selectors", async () => {
    const nameEl = { textContent: vi.fn().mockReturnValue("Dance Trophy Gold") };
    const skuEl = { textContent: vi.fn().mockReturnValue("TRP-001") };

    const mockPage = makeMockPage({
      $: vi.fn().mockImplementation((selector: string) => {
        if (selector === ".product-name") return Promise.resolve(nameEl);
        if (selector === ".product-sku") return Promise.resolve(skuEl);
        return Promise.resolve(null);
      }),
      $$eval: vi.fn().mockImplementation((selector: string) => {
        if (selector === ".product-image img") {
          return Promise.resolve(["https://example.com/img1.jpg", "https://example.com/img2.jpg"]);
        }
        return Promise.resolve([]);
      }),
    });

    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const config = makeConfig();
    const product = await extractProduct("https://example.com/trophy-1", config, browser);

    expect(product.name).toBe("Dance Trophy Gold");
    expect(product.sku).toBe("TRP-001");
    expect(product.images).toEqual(["https://example.com/img1.jpg", "https://example.com/img2.jpg"]);
    expect(product.sourceUrl).toBe("https://example.com/trophy-1");
    expect(product.scrapedAt).toBeDefined();
  });

  it("extracts optional price field", async () => {
    const nameEl = { textContent: vi.fn().mockReturnValue("Trophy") };
    const skuEl = { textContent: vi.fn().mockReturnValue("SKU-1") };
    const priceEl = { textContent: vi.fn().mockReturnValue("$29.95") };

    const mockPage = makeMockPage({
      $: vi.fn().mockImplementation((selector: string) => {
        if (selector === ".product-name") return Promise.resolve(nameEl);
        if (selector === ".product-sku") return Promise.resolve(skuEl);
        if (selector === ".product-price") return Promise.resolve(priceEl);
        return Promise.resolve(null);
      }),
      $$eval: vi.fn().mockResolvedValue([]),
    });

    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const config = makeConfig({
      selectors: {
        name: ".product-name",
        sku: ".product-sku",
        images: ".product-image img",
        price: ".product-price",
      },
    });

    const product = await extractProduct("https://example.com/p", config, browser);
    expect(product.price).toBe(29.95);
  });

  it("extracts optional dimensions", async () => {
    const nameEl = { textContent: vi.fn().mockReturnValue("Trophy") };
    const skuEl = { textContent: vi.fn().mockReturnValue("SKU-1") };
    const weightEl = { textContent: vi.fn().mockReturnValue("150") };
    const heightEl = { textContent: vi.fn().mockReturnValue("200") };

    const mockPage = makeMockPage({
      $: vi.fn().mockImplementation((selector: string) => {
        if (selector === ".product-name") return Promise.resolve(nameEl);
        if (selector === ".product-sku") return Promise.resolve(skuEl);
        if (selector === ".weight") return Promise.resolve(weightEl);
        if (selector === ".height") return Promise.resolve(heightEl);
        return Promise.resolve(null);
      }),
      $$eval: vi.fn().mockResolvedValue([]),
    });

    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const config = makeConfig({
      selectors: {
        name: ".product-name",
        sku: ".product-sku",
        images: ".product-image img",
        weight: ".weight",
        height: ".height",
      },
    });

    const product = await extractProduct("https://example.com/p", config, browser);
    expect(product.dimensions).toEqual({ weight: 150, height: 200, width: undefined });
  });

  it("extracts category breadcrumb", async () => {
    const nameEl = { textContent: vi.fn().mockReturnValue("Trophy") };
    const skuEl = { textContent: vi.fn().mockReturnValue("SKU-1") };

    const mockPage = makeMockPage({
      $: vi.fn().mockImplementation((selector: string) => {
        if (selector === ".product-name") return Promise.resolve(nameEl);
        if (selector === ".product-sku") return Promise.resolve(skuEl);
        return Promise.resolve(null);
      }),
      $$eval: vi.fn().mockImplementation((selector: string) => {
        if (selector === ".breadcrumb a") {
          return Promise.resolve(["Home", "Trophies", "Dance"]);
        }
        if (selector === ".product-image img") {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
    });

    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const config = makeConfig({
      selectors: {
        name: ".product-name",
        sku: ".product-sku",
        images: ".product-image img",
        categoryBreadcrumb: ".breadcrumb a",
      },
    });

    const product = await extractProduct("https://example.com/p", config, browser);
    expect(product.categoryPath).toEqual(["Home", "Trophies", "Dance"]);
  });

  it("extracts extra attributes via config selectors", async () => {
    const nameEl = { textContent: vi.fn().mockReturnValue("Trophy") };
    const skuEl = { textContent: vi.fn().mockReturnValue("SKU-1") };
    const colourEl = { textContent: vi.fn().mockReturnValue("Gold") };

    const mockPage = makeMockPage({
      $: vi.fn().mockImplementation((selector: string) => {
        if (selector === ".product-name") return Promise.resolve(nameEl);
        if (selector === ".product-sku") return Promise.resolve(skuEl);
        if (selector === ".colour-swatch") return Promise.resolve(colourEl);
        return Promise.resolve(null);
      }),
      $$eval: vi.fn().mockResolvedValue([]),
    });

    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const config = makeConfig({
      selectors: {
        name: ".product-name",
        sku: ".product-sku",
        images: ".product-image img",
        extra: { pa_colour: ".colour-swatch" },
      },
    });

    const product = await extractProduct("https://example.com/p", config, browser);
    expect(product.attributes).toEqual({ pa_colour: "Gold" });
  });

  it("returns empty attributes when no extra selectors are defined", async () => {
    const nameEl = { textContent: vi.fn().mockReturnValue("Trophy") };
    const skuEl = { textContent: vi.fn().mockReturnValue("SKU-1") };

    const mockPage = makeMockPage({
      $: vi.fn().mockImplementation((selector: string) => {
        if (selector === ".product-name") return Promise.resolve(nameEl);
        if (selector === ".product-sku") return Promise.resolve(skuEl);
        return Promise.resolve(null);
      }),
      $$eval: vi.fn().mockResolvedValue([]),
    });

    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const config = makeConfig();
    const product = await extractProduct("https://example.com/p", config, browser);
    expect(product.attributes).toEqual({});
  });

  it("sets scrapedAt to a valid ISO 8601 timestamp", async () => {
    const nameEl = { textContent: vi.fn().mockReturnValue("Trophy") };
    const skuEl = { textContent: vi.fn().mockReturnValue("SKU-1") };

    const mockPage = makeMockPage({
      $: vi.fn().mockImplementation((selector: string) => {
        if (selector === ".product-name") return Promise.resolve(nameEl);
        if (selector === ".product-sku") return Promise.resolve(skuEl);
        return Promise.resolve(null);
      }),
      $$eval: vi.fn().mockResolvedValue([]),
    });

    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn().mockResolvedValue(mockPage),
    } as unknown as BrowserManager;

    const config = makeConfig();
    const product = await extractProduct("https://example.com/p", config, browser);

    // Should parse as a valid date
    const parsed = new Date(product.scrapedAt);
    expect(parsed.toISOString()).toBe(product.scrapedAt);
  });
});

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
// scrape — full integration (mocked browser)
// ---------------------------------------------------------------------------

describe("scrape", () => {
  it("discovers URLs and extracts products for each", async () => {
    const sitemapXml = `<urlset>
      <url><loc>https://example.com/product-1</loc></url>
      <url><loc>https://example.com/product-2</loc></url>
    </urlset>`;

    const nameEl = { textContent: vi.fn().mockReturnValue("Trophy") };
    const skuEl = { textContent: vi.fn().mockReturnValue("SKU-1") };

    // The sitemap page (returned by first goto call)
    const sitemapPage = makeMockPage({
      content: vi.fn().mockResolvedValue(sitemapXml),
    });

    // Product pages (returned by subsequent goto calls)
    const productPage = makeMockPage({
      $: vi.fn().mockImplementation((selector: string) => {
        if (selector === ".product-name") return Promise.resolve(nameEl);
        if (selector === ".product-sku") return Promise.resolve(skuEl);
        return Promise.resolve(null);
      }),
      $$eval: vi.fn().mockResolvedValue([]),
    });

    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn()
        .mockResolvedValueOnce(sitemapPage)   // sitemap fetch
        .mockResolvedValueOnce(productPage)   // product 1
        .mockResolvedValueOnce(productPage),  // product 2
    } as unknown as BrowserManager;

    const config = makeConfig({
      discovery: {
        type: "sitemap",
        url: "https://example.com/sitemap.xml",
        filterPatterns: [],
      },
    });

    const result = await scrape({ config }, browser);

    expect(result.products).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.products[0].sku).toBe("SKU-1");
  });

  it("reports errors for failed product extractions", async () => {
    // Zero out setTimeout delays to avoid waiting for retry backoff
    const origSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void) => origSetTimeout(fn, 0)) as typeof globalThis.setTimeout;

    try {
      const sitemapXml = `<urlset>
        <url><loc>https://example.com/product-1</loc></url>
      </urlset>`;

      const sitemapPage = makeMockPage({
        content: vi.fn().mockResolvedValue(sitemapXml),
      });

      // Product page that always throws
      const failingPage = makeMockPage({
        $: vi.fn().mockImplementation(async () => { throw new Error("Element not found"); }),
        $$eval: vi.fn().mockImplementation(async () => { throw new Error("Element not found"); }),
      });

      const browser = {
        ...makeMockBrowser(),
        goto: vi.fn()
          .mockResolvedValueOnce(sitemapPage)
          .mockResolvedValue(failingPage),
      } as unknown as BrowserManager;

      const config = makeConfig({
        discovery: {
          type: "sitemap",
          url: "https://example.com/sitemap.xml",
          filterPatterns: [],
        },
      });

      const result = await scrape({ config }, browser);
      expect(result.products).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].url).toBe("https://example.com/product-1");
      expect(result.errors[0].retries).toBe(3);
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
  });

  it("filters URLs by categories when specified", async () => {
    const sitemapXml = `<urlset>
      <url><loc>https://example.com/trophies/dance/product-1</loc></url>
      <url><loc>https://example.com/trophies/sports/product-2</loc></url>
    </urlset>`;

    const nameEl = { textContent: vi.fn().mockReturnValue("Trophy") };
    const skuEl = { textContent: vi.fn().mockReturnValue("SKU-1") };

    const sitemapPage = makeMockPage({
      content: vi.fn().mockResolvedValue(sitemapXml),
    });
    const productPage = makeMockPage({
      $: vi.fn().mockImplementation((selector: string) => {
        if (selector === ".product-name") return Promise.resolve(nameEl);
        if (selector === ".product-sku") return Promise.resolve(skuEl);
        return Promise.resolve(null);
      }),
      $$eval: vi.fn().mockResolvedValue([]),
    });

    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn()
        .mockResolvedValueOnce(sitemapPage)
        .mockResolvedValue(productPage),
    } as unknown as BrowserManager;

    const config = makeConfig({
      discovery: {
        type: "sitemap",
        url: "https://example.com/sitemap.xml",
        filterPatterns: [],
      },
    });

    const result = await scrape({ config, categories: ["dance"] }, browser);

    // Only the dance URL should be scraped
    expect(result.products).toHaveLength(1);
  });

  it("calls onProgress callback during scraping", async () => {
    const sitemapXml = `<urlset>
      <url><loc>https://example.com/product-1</loc></url>
    </urlset>`;

    const nameEl = { textContent: vi.fn().mockReturnValue("Trophy") };
    const skuEl = { textContent: vi.fn().mockReturnValue("SKU-1") };

    const sitemapPage = makeMockPage({
      content: vi.fn().mockResolvedValue(sitemapXml),
    });
    const productPage = makeMockPage({
      $: vi.fn().mockImplementation((selector: string) => {
        if (selector === ".product-name") return Promise.resolve(nameEl);
        if (selector === ".product-sku") return Promise.resolve(skuEl);
        return Promise.resolve(null);
      }),
      $$eval: vi.fn().mockResolvedValue([]),
    });

    const browser = {
      ...makeMockBrowser(),
      goto: vi.fn()
        .mockResolvedValueOnce(sitemapPage)
        .mockResolvedValue(productPage),
    } as unknown as BrowserManager;

    const config = makeConfig({
      discovery: {
        type: "sitemap",
        url: "https://example.com/sitemap.xml",
        filterPatterns: [],
      },
    });

    const progressCalls: any[] = [];
    await scrape(
      { config, onProgress: (p) => progressCalls.push({ ...p }) },
      browser,
    );

    // Should have at least the discovering phase and scraping phase
    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
    expect(progressCalls[0].phase).toBe("discovering");
    expect(progressCalls.some((p) => p.phase === "scraping")).toBe(true);
  });
});
