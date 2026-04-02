import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the @anthropic-ai/claude-agent-sdk
// ---------------------------------------------------------------------------

// vi.hoisted() runs before vi.mock() hoisting, so mockQuery is available
// inside the factory without "before initialization" errors.
const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQuery,
}));

// Import modules under test AFTER the mock is set up
import { executeAgent, parseJsonResponse } from "../executor.js";
import { analyzeSite } from "../site-recon.js";
import { generateDescriptions } from "../descriptions.js";
import { generateSeo } from "../seo.js";

import type { GroupedProduct, BusinessConfig, RawProduct } from "../../pipeline/models.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create an async iterable that yields the given items.
 * Simulates the streaming response from the SDK query() function.
 */
function makeAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next() {
          if (index < items.length) {
            return { value: items[index++], done: false };
          }
          return { value: undefined as unknown as T, done: true };
        },
      };
    },
  };
}

/** Build a minimal RawProduct for testing. */
function makeRawProduct(overrides: Partial<RawProduct> = {}): RawProduct {
  return {
    sku: "TEST-001",
    name: "Test Trophy Gold 150mm",
    sourceUrl: "https://example.com/test-trophy-gold",
    categoryPath: ["Trophies", "Dance"],
    attributes: { pa_colour: "Gold", pa_size: "150mm" },
    images: ["https://example.com/img.jpg"],
    scrapedAt: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

/** Build a minimal GroupedProduct for testing. */
function makeGroupedProduct(overrides: Partial<GroupedProduct> = {}): GroupedProduct {
  return {
    parentSku: "DANCE-001",
    name: "Jetstream Dance Trophy",
    type: "variable",
    categoryPath: ["Trophies", "Dance"],
    variations: [
      makeRawProduct({ sku: "DANCE-001", attributes: { pa_colour: "Gold" } }),
      makeRawProduct({ sku: "DANCE-002", attributes: { pa_colour: "Silver" } }),
    ],
    attributeValues: {
      pa_colour: ["Gold", "Silver"],
    },
    ...overrides,
  };
}

/** Build a BusinessConfig for testing. */
function makeBusinessConfig(): BusinessConfig {
  return {
    name: "My Trophy Shop",
    location: "Sydney NSW",
    region: "Inner West",
    seoTemplates: {
      metaTitle: "{keywords} {region} | {productName}",
      metaDescription:
        "{description} Prepared locally in {location} for {region} {keywords}.",
    },
  };
}

beforeEach(() => {
  mockQuery.mockReset();
});

// ===========================================================================
// executeAgent
// ===========================================================================

describe("executeAgent", () => {
  it("collects text from content blocks in streamed messages", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        {
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world" },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      ]),
    );

    const result = await executeAgent("test prompt", {
      model: "claude-sonnet-4-6",
      systemPrompt: "You are a test agent.",
    });

    expect(result.text).toBe("Hello world");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("concatenates text across multiple streamed events", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: "Part 1 " }] },
        { content: [{ type: "text", text: "Part 2" }] },
      ]),
    );

    const result = await executeAgent("test", {
      model: "claude-sonnet-4-6",
      systemPrompt: "test",
    });

    expect(result.text).toBe("Part 1 Part 2");
  });

  it("ignores non-text content blocks", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        {
          content: [
            { type: "tool_use", name: "bash", input: {} },
            { type: "text", text: "actual text" },
          ],
        },
      ]),
    );

    const result = await executeAgent("test", {
      model: "claude-sonnet-4-6",
      systemPrompt: "test",
    });

    expect(result.text).toBe("actual text");
  });

  it("returns empty text when no content blocks are present", async () => {
    mockQuery.mockReturnValue(makeAsyncIterable([{}]));

    const result = await executeAgent("test", {
      model: "claude-sonnet-4-6",
      systemPrompt: "test",
    });

    expect(result.text).toBe("");
    expect(result.usage).toBeUndefined();
  });

  it("passes options to the SDK query function", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([{ content: [{ type: "text", text: "ok" }] }]),
    );

    await executeAgent("my prompt", {
      model: "claude-opus-4-6",
      systemPrompt: "my system prompt",
      maxTokens: 2048,
    });

    expect(mockQuery).toHaveBeenCalledWith({
      prompt: "my prompt",
      options: expect.objectContaining({
        model: "claude-opus-4-6",
        systemPrompt: "my system prompt",
        maxTokens: 2048,
      }),
    });
  });

  it("uses default maxTokens of 4096 when not specified", async () => {
    mockQuery.mockReturnValue(makeAsyncIterable([]));

    await executeAgent("test", {
      model: "claude-sonnet-4-6",
      systemPrompt: "test",
    });

    expect(mockQuery).toHaveBeenCalledWith({
      prompt: "test",
      options: expect.objectContaining({ maxTokens: 4096, maxTurns: 50 }),
    });
  });
});

// ===========================================================================
// parseJsonResponse
// ===========================================================================

describe("parseJsonResponse", () => {
  it("parses plain JSON", () => {
    const result = parseJsonResponse<{ a: number }>('{"a": 1}');
    expect(result).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    const result = parseJsonResponse<number[]>('```json\n[1,2,3]\n```');
    expect(result).toEqual([1, 2, 3]);
  });

  it("strips ``` fences without language tag", () => {
    const result = parseJsonResponse<number[]>('```\n[1]\n```');
    expect(result).toEqual([1]);
  });

  it("trims surrounding whitespace", () => {
    const result = parseJsonResponse<{ x: string }>('  \n {"x":"y"} \n ');
    expect(result).toEqual({ x: "y" });
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJsonResponse("{bad")).toThrow();
  });
});

// ===========================================================================
// analyzeSite
// ===========================================================================

describe("analyzeSite", () => {
  const validSiteConfig = {
    name: "example-com",
    baseUrl: "https://example.com",
    discovery: {
      type: "sitemap",
      url: "https://example.com/sitemap.xml",
      filterPatterns: ["/product/"],
    },
    selectors: {
      name: "h1.product-title",
      sku: ".sku",
      images: ".product-gallery img",
    },
    attributes: [
      {
        name: "Colour",
        slug: "pa_colour",
        isVariation: true,
        isGlobal: true,
      },
    ],
    rateLimit: 1500,
    variants: { type: "same-page" },
    pipeline: "http-direct",
    variantExtraction: { method: "visible-table", tableSelector: "table" },
  };

  it("calls executeAgent with the Opus model", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: JSON.stringify(validSiteConfig) }] },
      ]),
    );

    await analyzeSite("https://example.com");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ model: expect.stringContaining("opus") }) }),
    );
  });

  it("parses a valid SiteConfig from the agent response", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: JSON.stringify(validSiteConfig) }] },
      ]),
    );

    const result = await analyzeSite("https://example.com");

    expect(result.name).toBe("example-com");
    expect(result.baseUrl).toBe("https://example.com");
    expect(result.discovery.type).toBe("sitemap");
    expect(result.selectors.name).toBe("h1.product-title");
    expect(result.attributes).toHaveLength(1);
    expect(result.rateLimit).toBe(1500);
  });

  it("strips markdown code fences from the response", async () => {
    const wrappedJson = "```json\n" + JSON.stringify(validSiteConfig) + "\n```";
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: wrappedJson }] },
      ]),
    );

    const result = await analyzeSite("https://example.com");
    expect(result.name).toBe("example-com");
  });

  it("includes the URL in the prompt", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: JSON.stringify(validSiteConfig) }] },
      ]),
    );

    await analyzeSite("https://trophies.com.au");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("https://trophies.com.au"),
      }),
    );
  });

  it("throws when required fields are missing", async () => {
    const incomplete = { name: "test", baseUrl: "https://test.com" };
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: JSON.stringify(incomplete) }] },
      ]),
    );

    await expect(analyzeSite("https://test.com")).rejects.toThrow(
      "SiteConfig missing required field",
    );
  });

  it("throws when selectors are missing name, sku, or images", async () => {
    const noSelectors = {
      ...validSiteConfig,
      selectors: { name: "h1", sku: "", images: ".img" },
    };
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: JSON.stringify(noSelectors) }] },
      ]),
    );

    await expect(analyzeSite("https://test.com")).rejects.toThrow(
      "SiteConfig selectors must include",
    );
  });

  it("throws on invalid JSON response", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: "not valid json {{{" }] },
      ]),
    );

    await expect(analyzeSite("https://test.com")).rejects.toThrow(
      "Failed to parse SiteConfig JSON",
    );
  });
});

// ===========================================================================
// generateDescriptions
// ===========================================================================

describe("generateDescriptions", () => {
  const mockDescriptions = [
    {
      parentSku: "DANCE-001",
      shortDescription: "A streamlined dance trophy available in gold and silver finishes.",
      longDescription:
        "<ul><li>Dance trophy with modern design</li><li>Available in Gold and Silver</li></ul>",
    },
  ];

  it("calls executeAgent with the Haiku model", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: JSON.stringify(mockDescriptions) }] },
      ]),
    );

    await generateDescriptions([makeGroupedProduct()]);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ model: expect.stringContaining("haiku") }) }),
    );
  });

  it("includes all product data in the prompt", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: JSON.stringify(mockDescriptions) }] },
      ]),
    );

    await generateDescriptions([makeGroupedProduct()]);

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.prompt).toContain("DANCE-001");
    expect(callArgs.prompt).toContain("Jetstream Dance Trophy");
    expect(callArgs.prompt).toContain("pa_colour");
  });

  it("parses descriptions from the agent response", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: JSON.stringify(mockDescriptions) }] },
      ]),
    );

    const result = await generateDescriptions([makeGroupedProduct()]);

    expect(result).toHaveLength(1);
    expect(result[0].parentSku).toBe("DANCE-001");
    expect(result[0].shortDescription).toContain("dance trophy");
    expect(result[0].longDescription).toContain("<ul>");
  });

  it("returns empty array for empty input", async () => {
    const result = await generateDescriptions([]);
    expect(result).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("handles markdown-fenced JSON response", async () => {
    const fenced = "```json\n" + JSON.stringify(mockDescriptions) + "\n```";
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: fenced }] },
      ]),
    );

    const result = await generateDescriptions([makeGroupedProduct()]);
    expect(result).toHaveLength(1);
  });

  it("throws on invalid JSON response", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: "not json" }] },
      ]),
    );

    await expect(generateDescriptions([makeGroupedProduct()])).rejects.toThrow(
      "Failed to parse description JSON",
    );
  });

  it("throws when a description entry is missing required fields", async () => {
    const incomplete = [{ parentSku: "DANCE-001" }];
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: JSON.stringify(incomplete) }] },
      ]),
    );

    await expect(generateDescriptions([makeGroupedProduct()])).rejects.toThrow(
      "Description entry missing required fields",
    );
  });

  it("batches products when exceeding batch size", async () => {
    // Create 150 products — should result in 2 API calls (100 + 50)
    const products: GroupedProduct[] = [];
    const allDescs = [];
    for (let i = 0; i < 150; i++) {
      products.push(
        makeGroupedProduct({ parentSku: `PROD-${String(i).padStart(3, "0")}` }),
      );
      allDescs.push({
        parentSku: `PROD-${String(i).padStart(3, "0")}`,
        shortDescription: `Desc ${i}`,
        longDescription: `<ul><li>Long desc ${i}</li></ul>`,
      });
    }

    // First call returns first 100, second call returns remaining 50
    const batch1 = allDescs.slice(0, 100);
    const batch2 = allDescs.slice(100);

    mockQuery
      .mockReturnValueOnce(
        makeAsyncIterable([
          { content: [{ type: "text", text: JSON.stringify(batch1) }] },
        ]),
      )
      .mockReturnValueOnce(
        makeAsyncIterable([
          { content: [{ type: "text", text: JSON.stringify(batch2) }] },
        ]),
      );

    const result = await generateDescriptions(products);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(150);
    expect(result[0].parentSku).toBe("PROD-000");
    expect(result[149].parentSku).toBe("PROD-149");
  });
});

// ===========================================================================
// generateSeo
// ===========================================================================

describe("generateSeo", () => {
  const mockSeoData = [
    {
      parentSku: "DANCE-001",
      metaTitle: "Dance Trophies Inner West | Jetstream Dance Trophy",
      metaDescription:
        "A streamlined dance trophy with gold and silver options. Prepared locally in Sydney NSW for Inner West dance trophies.",
      permalink: "jetstream-dance-trophies",
      keywords: "dance trophies",
    },
  ];

  it("calls executeAgent with the Sonnet model", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: JSON.stringify(mockSeoData) }] },
      ]),
    );

    await generateSeo([makeGroupedProduct()], makeBusinessConfig());

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ model: expect.stringContaining("sonnet") }) }),
    );
  });

  it("includes business config in the system prompt", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: JSON.stringify(mockSeoData) }] },
      ]),
    );

    await generateSeo([makeGroupedProduct()], makeBusinessConfig());

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.systemPrompt).toContain("My Trophy Shop");
    expect(callArgs.options.systemPrompt).toContain("Sydney NSW");
    expect(callArgs.options.systemPrompt).toContain("Inner West");
  });

  it("includes SEO templates in the system prompt", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: JSON.stringify(mockSeoData) }] },
      ]),
    );

    await generateSeo([makeGroupedProduct()], makeBusinessConfig());

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.systemPrompt).toContain("{keywords}");
    expect(callArgs.options.systemPrompt).toContain("{productName}");
  });

  it("includes product data in the prompt", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: JSON.stringify(mockSeoData) }] },
      ]),
    );

    await generateSeo([makeGroupedProduct()], makeBusinessConfig());

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.prompt).toContain("DANCE-001");
    expect(callArgs.prompt).toContain("Jetstream Dance Trophy");
  });

  it("parses SEO data from the agent response", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: JSON.stringify(mockSeoData) }] },
      ]),
    );

    const result = await generateSeo([makeGroupedProduct()], makeBusinessConfig());

    expect(result).toHaveLength(1);
    expect(result[0].parentSku).toBe("DANCE-001");
    expect(result[0].metaTitle).toContain("Dance Trophies");
    expect(result[0].permalink).toBe("jetstream-dance-trophies");
    expect(result[0].keywords).toBe("dance trophies");
  });

  it("returns empty array for empty input", async () => {
    const result = await generateSeo([], makeBusinessConfig());
    expect(result).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("throws on invalid JSON response", async () => {
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: "{invalid" }] },
      ]),
    );

    await expect(
      generateSeo([makeGroupedProduct()], makeBusinessConfig()),
    ).rejects.toThrow("Failed to parse SEO JSON");
  });

  it("handles markdown-fenced JSON response", async () => {
    const fenced = "```json\n" + JSON.stringify(mockSeoData) + "\n```";
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: fenced }] },
      ]),
    );

    const result = await generateSeo([makeGroupedProduct()], makeBusinessConfig());
    expect(result).toHaveLength(1);
  });

  it("batches products when exceeding batch size", async () => {
    // Create 150 products — should result in 2 API calls (100 + 50)
    const products: GroupedProduct[] = [];
    const allSeo = [];
    for (let i = 0; i < 150; i++) {
      products.push(
        makeGroupedProduct({ parentSku: `PROD-${String(i).padStart(3, "0")}` }),
      );
      allSeo.push({
        parentSku: `PROD-${String(i).padStart(3, "0")}`,
        metaTitle: `Title ${i}`,
        metaDescription: `Description ${i}`,
        permalink: `product-${i}`,
        keywords: `keyword ${i}`,
      });
    }

    // First call returns first 100, second call returns remaining 50
    const batch1 = allSeo.slice(0, 100);
    const batch2 = allSeo.slice(100);

    mockQuery
      .mockReturnValueOnce(
        makeAsyncIterable([
          { content: [{ type: "text", text: JSON.stringify(batch1) }] },
        ]),
      )
      .mockReturnValueOnce(
        makeAsyncIterable([
          { content: [{ type: "text", text: JSON.stringify(batch2) }] },
        ]),
      );

    const result = await generateSeo(products, makeBusinessConfig());

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(150);
    expect(result[0].parentSku).toBe("PROD-000");
    expect(result[149].parentSku).toBe("PROD-149");
  });

  it("throws when an SEO entry is missing required fields", async () => {
    const incomplete = [{ parentSku: "DANCE-001", metaTitle: "Title" }];
    mockQuery.mockReturnValue(
      makeAsyncIterable([
        { content: [{ type: "text", text: JSON.stringify(incomplete) }] },
      ]),
    );

    await expect(
      generateSeo([makeGroupedProduct()], makeBusinessConfig()),
    ).rejects.toThrow("SEO entry missing required fields");
  });
});

// ===========================================================================
// Error propagation
// ===========================================================================

describe("error propagation", () => {
  it("propagates SDK errors from executeAgent", async () => {
    mockQuery.mockImplementation(() => {
      throw new Error("API key invalid");
    });

    await expect(
      executeAgent("test", { model: "claude-sonnet-4-6", systemPrompt: "test" }),
    ).rejects.toThrow("API key invalid");
  });

  it("propagates SDK errors through analyzeSite", async () => {
    mockQuery.mockImplementation(() => {
      throw new Error("Rate limited");
    });

    await expect(analyzeSite("https://example.com")).rejects.toThrow("Rate limited");
  });

  it("propagates SDK errors through generateDescriptions", async () => {
    mockQuery.mockImplementation(() => {
      throw new Error("Network error");
    });

    await expect(
      generateDescriptions([makeGroupedProduct()]),
    ).rejects.toThrow("Network error");
  });

  it("propagates SDK errors through generateSeo", async () => {
    mockQuery.mockImplementation(() => {
      throw new Error("Timeout");
    });

    await expect(
      generateSeo([makeGroupedProduct()], makeBusinessConfig()),
    ).rejects.toThrow("Timeout");
  });

  it("propagates async iterable errors from executeAgent", async () => {
    mockQuery.mockReturnValue({
      [Symbol.asyncIterator]() {
        return {
          async next() {
            throw new Error("Stream interrupted");
          },
        };
      },
    });

    await expect(
      executeAgent("test", { model: "claude-sonnet-4-6", systemPrompt: "test" }),
    ).rejects.toThrow("Stream interrupted");
  });
});
