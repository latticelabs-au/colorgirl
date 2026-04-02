import { describe, it, expect, vi } from "vitest";
import type { SiteConfig } from "../../pipeline/models.js";

// Mock http-client
vi.mock("../http-client.js", () => ({
  createHttpClient: vi.fn(),
}));

import { createHttpClient } from "../http-client.js";
import { httpDirectPipeline } from "../pipelines/http-direct.js";
import { sitemapHttpPipeline } from "../pipelines/sitemap-http.js";

function makeConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    name: "test",
    baseUrl: "https://example.com",
    discovery: {
      type: "category-list",
      sections: [{ name: "Trophies", path: "/trophies", categories: ["dance"] }],
    },
    selectors: { name: ".name", sku: ".sku", images: ".images img" },
    attributes: [],
    rateLimit: 0,
    variants: { type: "same-page" },
    pipeline: "http-direct",
    variantExtraction: { method: "visible-table", tableSelector: "table" },
    ...overrides,
  };
}

const PRODUCT_HTML = `
  <h1 class="name">Trophy</h1>
  <span class="sku">SKU-1</span>
  <div class="images"><img src="https://example.com/img.jpg"></div>`;

// ---------------------------------------------------------------------------
// HTTP Direct Pipeline (Tier 1)
// ---------------------------------------------------------------------------

describe("httpDirectPipeline", () => {
  it("discovers product URLs from category pages and scrapes each", async () => {
    const categoryHtml = `
      <div>
        <a href="https://example.com/product-1">Product 1</a>
        <a href="https://example.com/product-2">Product 2</a>
      </div>`;

    // First call: category page with links
    // Second call: same page (no new links -> stops pagination)
    // Third+Fourth calls: product pages
    const mockGet = vi.fn()
      .mockResolvedValueOnce(categoryHtml)
      .mockResolvedValueOnce(categoryHtml)
      .mockResolvedValueOnce(PRODUCT_HTML)
      .mockResolvedValueOnce(PRODUCT_HTML);

    (createHttpClient as any).mockReturnValue({ get: mockGet, getRaw: vi.fn() });

    const config = makeConfig();
    const result = await httpDirectPipeline(config);

    expect(result.products.length).toBeGreaterThanOrEqual(1);
    expect(result.errors).toHaveLength(0);
    expect(result.products[0].sku).toBe("SKU-1");
  });

  it("collects errors for failed product fetches", async () => {
    const categoryHtml = `<a href="https://example.com/product-1">P1</a>`;

    // Zero out setTimeout to avoid retry delays
    const origSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void) => origSetTimeout(fn, 0)) as typeof globalThis.setTimeout;

    try {
      const mockGet = vi.fn()
        .mockResolvedValueOnce(categoryHtml)
        .mockResolvedValueOnce(categoryHtml)
        .mockRejectedValue(new Error("timeout"));

      (createHttpClient as any).mockReturnValue({ get: mockGet, getRaw: vi.fn() });

      const config = makeConfig();
      const result = await httpDirectPipeline(config);

      expect(result.products).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
  });
});

// ---------------------------------------------------------------------------
// Sitemap + HTTP Pipeline (Tier 2)
// ---------------------------------------------------------------------------

describe("sitemapHttpPipeline", () => {
  it("fetches sitemap, extracts product URLs, and scrapes each", async () => {
    const sitemapXml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/product-1</loc></url>
        <url><loc>https://example.com/product-2</loc></url>
        <url><loc>https://example.com/about</loc></url>
      </urlset>`;

    const mockGet = vi.fn()
      .mockResolvedValueOnce(sitemapXml)
      .mockResolvedValueOnce(PRODUCT_HTML)
      .mockResolvedValueOnce(PRODUCT_HTML);

    (createHttpClient as any).mockReturnValue({ get: mockGet, getRaw: vi.fn() });

    const config = makeConfig({
      discovery: {
        type: "sitemap",
        url: "https://example.com/sitemap.xml",
        filterPatterns: ["/product-"],
      },
      pipeline: "sitemap-http",
    });

    const result = await sitemapHttpPipeline(config);

    expect(result.products).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it("handles gzipped sitemaps", async () => {
    const { gzipSync } = await import("node:zlib");
    const xml = `<urlset><url><loc>https://example.com/p1</loc></url></urlset>`;
    const gzipped = gzipSync(Buffer.from(xml));

    const mockGet = vi.fn().mockResolvedValue(PRODUCT_HTML);
    const mockGetRaw = vi.fn().mockResolvedValue(gzipped);

    (createHttpClient as any).mockReturnValue({ get: mockGet, getRaw: mockGetRaw });

    const config = makeConfig({
      discovery: {
        type: "sitemap",
        url: "https://example.com/sitemap.xml.gz",
        filterPatterns: [],
      },
      pipeline: "sitemap-http",
    });

    const result = await sitemapHttpPipeline(config);
    expect(result.products).toHaveLength(1);
    expect(mockGetRaw).toHaveBeenCalled();
  });
});
