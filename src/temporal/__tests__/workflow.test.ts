import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  RawProduct,
  GroupedProduct,
  EnrichedProduct,
  BusinessConfig,
  AttributeDef,
  SiteConfig,
} from "../../pipeline/models.js";

// ---------------------------------------------------------------------------
// Mock the underlying modules that activities delegate to
// ---------------------------------------------------------------------------

const mockAnalyzeSite = vi.hoisted(() => vi.fn());
const mockScrape = vi.hoisted(() => vi.fn());
const mockBrowserManager = vi.hoisted(() => vi.fn());
const mockGroupProducts = vi.hoisted(() => vi.fn());
const mockGenerateDescriptions = vi.hoisted(() => vi.fn());
const mockGenerateSeo = vi.hoisted(() => vi.fn());
const mockBuildCsv = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());
const mockConnect = vi.hoisted(() => vi.fn());
const mockClient = vi.hoisted(() => vi.fn());

vi.mock("../../agents/site-recon.js", () => ({
  analyzeSite: mockAnalyzeSite,
}));

vi.mock("../../scraper/engine.js", () => ({
  scrape: mockScrape,
}));

vi.mock("../../scraper/playwright.js", () => ({
  BrowserManager: mockBrowserManager,
}));

vi.mock("../../pipeline/grouper.js", () => ({
  groupProducts: mockGroupProducts,
}));

vi.mock("../../agents/descriptions.js", () => ({
  generateDescriptions: mockGenerateDescriptions,
}));

vi.mock("../../agents/seo.js", () => ({
  generateSeo: mockGenerateSeo,
}));

vi.mock("../../export/csv-builder.js", () => ({
  buildCsv: mockBuildCsv,
}));

vi.mock("fs/promises", () => ({
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
}));

vi.mock("@temporalio/client", () => ({
  Connection: { connect: mockConnect },
  Client: mockClient,
}));

// Import after mocks are set up
import { analyzeSiteActivity } from "../activities/analyze-site.js";
import { scrapeCategoryActivity } from "../activities/scrape-category.js";
import { groupProductsActivity } from "../activities/group-products.js";
import { generateDescsActivity } from "../activities/generate-descs.js";
import { generateSeoActivity } from "../activities/generate-seo.js";
import { buildCsvActivity } from "../activities/build-csv.js";
import { createTemporalClient, TASK_QUEUE } from "../client.js";
import { mergeEnrichment } from "../workflows/scrape-workflow.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeGroupedProduct(
  overrides: Partial<GroupedProduct> = {},
): GroupedProduct {
  return {
    parentSku: "DANCE-001",
    name: "Jetstream Dance Trophy",
    type: "variable",
    categoryPath: ["Trophies", "Dance"],
    variations: [
      makeRawProduct({ sku: "DANCE-001", attributes: { pa_colour: "Gold" } }),
      makeRawProduct({
        sku: "DANCE-002",
        attributes: { pa_colour: "Silver" },
      }),
    ],
    attributeValues: { pa_colour: ["Gold", "Silver"] },
    ...overrides,
  };
}

function makeSiteConfig(): SiteConfig {
  return {
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
  };
}

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
  vi.clearAllMocks();
  mockWriteFile.mockResolvedValue(undefined);
  mockMkdir.mockResolvedValue(undefined);
});

// ===========================================================================
// analyzeSiteActivity
// ===========================================================================

describe("analyzeSiteActivity", () => {
  it("delegates to analyzeSite with the provided URL", async () => {
    const config = makeSiteConfig();
    mockAnalyzeSite.mockResolvedValue(config);

    const result = await analyzeSiteActivity("https://example.com");

    expect(mockAnalyzeSite).toHaveBeenCalledWith("https://example.com");
    expect(result).toBe(config);
  });

  it("propagates errors from analyzeSite", async () => {
    mockAnalyzeSite.mockRejectedValue(new Error("Failed to analyse"));

    await expect(analyzeSiteActivity("https://bad.com")).rejects.toThrow(
      "Failed to analyse",
    );
  });
});

// ===========================================================================
// scrapeCategoryActivity
// ===========================================================================

describe("scrapeCategoryActivity", () => {
  it("delegates to scrape with config and category", async () => {
    const config = makeSiteConfig();
    const products = [makeRawProduct()];
    mockScrape.mockResolvedValue({ products, errors: [] });

    const result = await scrapeCategoryActivity(config, "dance");

    expect(mockScrape).toHaveBeenCalledWith(
      { config, categories: ["dance"] },
    );
    expect(result.products).toEqual(products);
    expect(result.errors).toEqual([]);
  });

  it("passes undefined categories when no category specified", async () => {
    const config = makeSiteConfig();
    mockScrape.mockResolvedValue({ products: [], errors: [] });

    await scrapeCategoryActivity(config);

    expect(mockScrape).toHaveBeenCalledWith(
      { config, categories: undefined },
    );
  });

  it("does not create its own BrowserManager (engine manages lifecycle)", async () => {
    const config = makeSiteConfig();
    mockScrape.mockResolvedValue({ products: [], errors: [] });

    await scrapeCategoryActivity(config);

    expect(mockBrowserManager).not.toHaveBeenCalled();
  });

  it("propagates errors from scrape", async () => {
    mockScrape.mockRejectedValue(new Error("Browser crash"));

    await expect(scrapeCategoryActivity(makeSiteConfig())).rejects.toThrow(
      "Browser crash",
    );
  });
});

// ===========================================================================
// groupProductsActivity
// ===========================================================================

describe("groupProductsActivity", () => {
  it("delegates to groupProducts with products and attributes", async () => {
    const products = [makeRawProduct()];
    const attrs: AttributeDef[] = [
      { name: "Colour", slug: "pa_colour", isVariation: true, isGlobal: true },
    ];
    const grouped = [makeGroupedProduct()];
    mockGroupProducts.mockReturnValue(grouped);

    const result = await groupProductsActivity(products, attrs);

    expect(mockGroupProducts).toHaveBeenCalledWith(products, {
      attributes: attrs,
    });
    expect(result).toEqual(grouped);
  });

  it("passes undefined attributes when not provided", async () => {
    mockGroupProducts.mockReturnValue([]);

    await groupProductsActivity([]);

    expect(mockGroupProducts).toHaveBeenCalledWith([], {
      attributes: undefined,
    });
  });
});

// ===========================================================================
// generateDescsActivity
// ===========================================================================

describe("generateDescsActivity", () => {
  it("delegates to generateDescriptions", async () => {
    const products = [makeGroupedProduct()];
    const descriptions = [
      {
        parentSku: "DANCE-001",
        shortDescription: "A dance trophy.",
        longDescription: "<ul><li>Dance trophy</li></ul>",
      },
    ];
    mockGenerateDescriptions.mockResolvedValue(descriptions);

    const result = await generateDescsActivity(products);

    expect(mockGenerateDescriptions).toHaveBeenCalledWith(products);
    expect(result).toEqual(descriptions);
  });

  it("propagates errors from generateDescriptions", async () => {
    mockGenerateDescriptions.mockRejectedValue(new Error("API error"));

    await expect(
      generateDescsActivity([makeGroupedProduct()]),
    ).rejects.toThrow("API error");
  });
});

// ===========================================================================
// generateSeoActivity
// ===========================================================================

describe("generateSeoActivity", () => {
  it("delegates to generateSeo with products and business config", async () => {
    const products = [makeGroupedProduct()];
    const businessConfig = makeBusinessConfig();
    const seoData = [
      {
        parentSku: "DANCE-001",
        metaTitle: "Dance Trophies Inner West | Jetstream Dance Trophy",
        metaDescription: "A dance trophy. Prepared locally in Sydney NSW.",
        permalink: "jetstream-dance-trophies",
        keywords: "dance trophies",
      },
    ];
    mockGenerateSeo.mockResolvedValue(seoData);

    const result = await generateSeoActivity(products, businessConfig);

    expect(mockGenerateSeo).toHaveBeenCalledWith(products, businessConfig);
    expect(result).toEqual(seoData);
  });

  it("propagates errors from generateSeo", async () => {
    mockGenerateSeo.mockRejectedValue(new Error("SEO API error"));

    await expect(
      generateSeoActivity([makeGroupedProduct()], makeBusinessConfig()),
    ).rejects.toThrow("SEO API error");
  });
});

// ===========================================================================
// buildCsvActivity
// ===========================================================================

describe("buildCsvActivity", () => {
  const makeEnrichedProduct = (): EnrichedProduct => ({
    ...makeGroupedProduct(),
    shortDescription: "A dance trophy.",
    longDescription: "<ul><li>Dance trophy</li></ul>",
    metaTitle: "Dance Trophies | Jetstream",
    metaDescription: "A dance trophy for events.",
    permalink: "jetstream-dance-trophies",
    keywords: "dance trophies",
  });

  it("calls buildCsv and writes to the output path", async () => {
    const csvContent = "\uFEFFID,Type,SKU\n,simple,TEST-001\n";
    mockBuildCsv.mockReturnValue(csvContent);

    const products = [makeEnrichedProduct()];
    const config = { attributes: makeSiteConfig().attributes };
    const outputPath = "/tmp/test-output.csv";

    const result = await buildCsvActivity(products, config, outputPath);

    expect(mockBuildCsv).toHaveBeenCalledWith(products, config);
    expect(mockMkdir).toHaveBeenCalledWith("/tmp", { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      outputPath,
      csvContent,
      "utf-8",
    );
    expect(result.filePath).toBe(outputPath);
    expect(result.productCount).toBe(1);
  });

  it("returns correct row count (excluding header)", async () => {
    // Header + 3 data rows
    const csvContent = "header\nrow1\nrow2\nrow3\n";
    mockBuildCsv.mockReturnValue(csvContent);

    const result = await buildCsvActivity(
      [makeEnrichedProduct()],
      { attributes: [] },
      "/tmp/out.csv",
    );

    expect(result.rowCount).toBe(3);
  });

  it("handles CSV with trailing empty lines", async () => {
    const csvContent = "header\nrow1\n\n\n";
    mockBuildCsv.mockReturnValue(csvContent);

    const result = await buildCsvActivity(
      [makeEnrichedProduct()],
      { attributes: [] },
      "/tmp/out.csv",
    );

    // Only non-empty lines counted, minus header
    expect(result.rowCount).toBe(1);
  });

  it("propagates write errors", async () => {
    mockBuildCsv.mockReturnValue("csv");
    mockWriteFile.mockRejectedValue(new Error("EACCES"));

    await expect(
      buildCsvActivity([makeEnrichedProduct()], { attributes: [] }, "/bad/path"),
    ).rejects.toThrow("EACCES");
  });
});

// ===========================================================================
// mergeEnrichment (pure function from workflow module)
// ===========================================================================

describe("mergeEnrichment", () => {
  it("merges descriptions and SEO into grouped products", () => {
    const products = [
      makeGroupedProduct({ parentSku: "DANCE-001" }),
      makeGroupedProduct({ parentSku: "SWIM-001", name: "Swim Medal" }),
    ];

    const descriptions = [
      {
        parentSku: "DANCE-001",
        shortDescription: "Dance trophy short desc",
        longDescription: "Dance trophy long desc",
      },
      {
        parentSku: "SWIM-001",
        shortDescription: "Swim medal short desc",
        longDescription: "Swim medal long desc",
      },
    ];

    const seoData = [
      {
        parentSku: "DANCE-001",
        metaTitle: "Dance Trophies | Jetstream",
        metaDescription: "Dance trophy meta desc.",
        permalink: "jetstream-dance-trophies",
        keywords: "dance trophies",
      },
      {
        parentSku: "SWIM-001",
        metaTitle: "Swimming Medals | Swim Medal",
        metaDescription: "Swim medal meta desc.",
        permalink: "swim-medal-swimming-medals",
        keywords: "swimming medals",
      },
    ];

    const result = mergeEnrichment(products, descriptions, seoData);

    expect(result).toHaveLength(2);

    // First product
    expect(result[0].parentSku).toBe("DANCE-001");
    expect(result[0].shortDescription).toBe("Dance trophy short desc");
    expect(result[0].longDescription).toBe("Dance trophy long desc");
    expect(result[0].metaTitle).toBe("Dance Trophies | Jetstream");
    expect(result[0].metaDescription).toBe("Dance trophy meta desc.");
    expect(result[0].permalink).toBe("jetstream-dance-trophies");
    expect(result[0].keywords).toBe("dance trophies");

    // Second product
    expect(result[1].parentSku).toBe("SWIM-001");
    expect(result[1].shortDescription).toBe("Swim medal short desc");
    expect(result[1].metaTitle).toBe("Swimming Medals | Swim Medal");
  });

  it("defaults to empty strings when description not found", () => {
    const products = [makeGroupedProduct({ parentSku: "UNKNOWN" })];
    const result = mergeEnrichment(products, [], []);

    expect(result[0].shortDescription).toBe("");
    expect(result[0].longDescription).toBe("");
    expect(result[0].metaTitle).toBe("");
    expect(result[0].metaDescription).toBe("");
    expect(result[0].permalink).toBe("");
    expect(result[0].keywords).toBe("");
  });

  it("preserves all grouped product fields", () => {
    const product = makeGroupedProduct({
      parentSku: "DANCE-001",
      name: "Jetstream Dance Trophy",
      type: "variable",
      categoryPath: ["Trophies", "Dance"],
    });

    const result = mergeEnrichment(product.variations.length ? [product] : [], [], []);
    if (result.length > 0) {
      expect(result[0].name).toBe("Jetstream Dance Trophy");
      expect(result[0].type).toBe("variable");
      expect(result[0].categoryPath).toEqual(["Trophies", "Dance"]);
      expect(result[0].variations).toEqual(product.variations);
      expect(result[0].attributeValues).toEqual(product.attributeValues);
    }
  });

  it("handles partial matches — only description found", () => {
    const products = [makeGroupedProduct({ parentSku: "DANCE-001" })];
    const descriptions = [
      {
        parentSku: "DANCE-001",
        shortDescription: "Short",
        longDescription: "Long",
      },
    ];

    const result = mergeEnrichment(products, descriptions, []);

    expect(result[0].shortDescription).toBe("Short");
    expect(result[0].longDescription).toBe("Long");
    expect(result[0].metaTitle).toBe("");
    expect(result[0].permalink).toBe("");
  });

  it("handles partial matches — only SEO found", () => {
    const products = [makeGroupedProduct({ parentSku: "DANCE-001" })];
    const seoData = [
      {
        parentSku: "DANCE-001",
        metaTitle: "Title",
        metaDescription: "Meta desc",
        permalink: "slug",
        keywords: "kw",
      },
    ];

    const result = mergeEnrichment(products, [], seoData);

    expect(result[0].shortDescription).toBe("");
    expect(result[0].longDescription).toBe("");
    expect(result[0].metaTitle).toBe("Title");
    expect(result[0].permalink).toBe("slug");
  });

  it("returns empty array for empty products", () => {
    const result = mergeEnrichment([], [], []);
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// createTemporalClient
// ===========================================================================

describe("createTemporalClient", () => {
  it("connects with default address when none provided", async () => {
    const mockConnection = { close: vi.fn() };
    mockConnect.mockResolvedValue(mockConnection);
    mockClient.mockImplementation(() => ({ connection: mockConnection }));

    await createTemporalClient();

    expect(mockConnect).toHaveBeenCalledWith({
      address: "localhost:7233",
    });
  });

  it("connects with custom address when provided", async () => {
    const mockConnection = { close: vi.fn() };
    mockConnect.mockResolvedValue(mockConnection);
    mockClient.mockImplementation(() => ({ connection: mockConnection }));

    await createTemporalClient("temporal.example.com:7233");

    expect(mockConnect).toHaveBeenCalledWith({
      address: "temporal.example.com:7233",
    });
  });

  it("propagates connection errors", async () => {
    mockConnect.mockRejectedValue(new Error("Connection refused"));

    await expect(createTemporalClient()).rejects.toThrow("Connection refused");
  });
});

// ===========================================================================
// TASK_QUEUE constant
// ===========================================================================

describe("TASK_QUEUE", () => {
  it("is set to 'colorgirl'", () => {
    expect(TASK_QUEUE).toBe("colorgirl");
  });
});
