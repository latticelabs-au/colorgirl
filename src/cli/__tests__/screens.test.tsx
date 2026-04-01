import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { WelcomeScreen } from "../screens/WelcomeScreen.js";
import { UrlInputScreen } from "../screens/UrlInputScreen.js";
import { AnalysisScreen } from "../screens/AnalysisScreen.js";
import { ConfigScreen } from "../screens/ConfigScreen.js";
import { ScrapeProgressScreen } from "../screens/ScrapeProgressScreen.js";
import { ProductReviewScreen } from "../screens/ProductReviewScreen.js";
import { EnrichmentScreen } from "../screens/EnrichmentScreen.js";
import { PreviewScreen } from "../screens/PreviewScreen.js";
import { ExportScreen } from "../screens/ExportScreen.js";
import type { SiteConfig, BusinessConfig, GroupedProduct, EnrichedProduct } from "../../pipeline/models.js";
import type { WorkflowProgress } from "../../temporal/workflows/scrape-workflow.js";

// ── Fixtures ────────────────────────────────────────────

const SITE_CONFIG: SiteConfig = {
  name: "test-site",
  baseUrl: "https://example.com",
  discovery: {
    type: "category-list",
    sections: [
      { name: "Trophies", path: "/trophies", categories: ["Football", "Cricket"] },
    ],
  },
  selectors: { name: ".name", sku: ".sku", images: ".img" },
  attributes: [
    { name: "Colour", slug: "pa_colour", isVariation: true, isGlobal: true },
    { name: "Size", slug: "pa_size", isVariation: true, isGlobal: true },
  ],
  rateLimit: 500,
  variants: { type: "same-page" },
};

const BUSINESS_CONFIG: BusinessConfig = {
  name: "Test Studio",
  location: "Sydney",
  region: "Test Region",
  seoTemplates: {
    metaTitle: "{keywords} {region} | {productName}",
    metaDescription: "{description} Prepared locally in {location}.",
  },
};

const PROGRESS: WorkflowProgress = {
  phase: "scraping",
  current: 3,
  total: 10,
  percentage: 30,
};

const GROUPED_PRODUCTS: GroupedProduct[] = [
  {
    parentSku: "SKU-001",
    name: "Gold Trophy",
    type: "variable",
    categoryPath: ["Trophies", "Football"],
    variations: [
      {
        sku: "SKU-001-S",
        name: "Gold Trophy S",
        sourceUrl: "https://example.com/p1",
        categoryPath: ["Trophies", "Football"],
        attributes: { pa_colour: "Gold", pa_size: "S" },
        images: [],
        scrapedAt: "2026-01-01T00:00:00Z",
      },
    ],
    attributeValues: { pa_colour: ["Gold"], pa_size: ["S", "M", "L"] },
  },
  {
    parentSku: "SKU-002",
    name: "Silver Medal",
    type: "simple",
    categoryPath: ["Medals"],
    variations: [
      {
        sku: "SKU-002",
        name: "Silver Medal",
        sourceUrl: "https://example.com/p2",
        categoryPath: ["Medals"],
        attributes: { pa_colour: "Silver" },
        images: [],
        scrapedAt: "2026-01-01T00:00:00Z",
      },
    ],
    attributeValues: { pa_colour: ["Silver"] },
  },
];

const ENRICHED_PRODUCTS: EnrichedProduct[] = GROUPED_PRODUCTS.map((p) => ({
  ...p,
  shortDescription: `Short desc for ${p.name}`,
  longDescription: `Long desc for ${p.name}`,
  metaTitle: `${p.name} Test Region`,
  metaDescription: `Meta desc for ${p.name}`,
  permalink: `${p.parentSku.toLowerCase()}-test`,
  keywords: "trophies",
}));

// ── Tests ───────────────────────────────────────────────

describe("WelcomeScreen", () => {
  it("renders without crashing", () => {
    const { lastFrame } = render(
      <WelcomeScreen version="0.1.0" isConnected={true} onContinue={() => {}} />,
    );
    expect(lastFrame()).toBeTruthy();
  });

  it("shows version", () => {
    const { lastFrame } = render(
      <WelcomeScreen version="0.1.0" isConnected={true} onContinue={() => {}} />,
    );
    expect(lastFrame()).toContain("0.1.0");
  });

  it("shows connected status", () => {
    const { lastFrame } = render(
      <WelcomeScreen version="0.1.0" isConnected={true} onContinue={() => {}} />,
    );
    expect(lastFrame()).toContain("Connected");
  });

  it("shows disconnected status", () => {
    const { lastFrame } = render(
      <WelcomeScreen version="0.1.0" isConnected={false} onContinue={() => {}} />,
    );
    expect(lastFrame()).toContain("Disconnected");
  });

  it("shows press enter hint", () => {
    const { lastFrame } = render(
      <WelcomeScreen version="0.1.0" isConnected={true} onContinue={() => {}} />,
    );
    expect(lastFrame()).toContain("Enter");
  });
});

describe("UrlInputScreen", () => {
  it("renders without crashing", () => {
    const { lastFrame } = render(<UrlInputScreen onSubmit={() => {}} />);
    expect(lastFrame()).toBeTruthy();
  });

  it("shows URL label", () => {
    const { lastFrame } = render(<UrlInputScreen onSubmit={() => {}} />);
    expect(lastFrame()).toContain("URL");
  });

  it("shows key hints", () => {
    const { lastFrame } = render(<UrlInputScreen onSubmit={() => {}} />);
    expect(lastFrame()).toContain("Submit");
    expect(lastFrame()).toContain("Back");
  });
});

describe("AnalysisScreen", () => {
  it("renders without crashing", () => {
    const { lastFrame } = render(
      <AnalysisScreen url="https://example.com" status="Working..." />,
    );
    expect(lastFrame()).toBeTruthy();
  });

  it("shows the URL", () => {
    const { lastFrame } = render(
      <AnalysisScreen url="https://example.com" status="" />,
    );
    expect(lastFrame()).toContain("https://example.com");
  });

  it("shows status message", () => {
    const { lastFrame } = render(
      <AnalysisScreen url="https://example.com" status="Identifying selectors" />,
    );
    expect(lastFrame()).toContain("Identifying selectors");
  });
});

describe("ConfigScreen", () => {
  it("renders without crashing", () => {
    const { lastFrame } = render(
      <ConfigScreen
        config={SITE_CONFIG}
        businessConfig={BUSINESS_CONFIG}
        onApprove={() => {}}
      />,
    );
    expect(lastFrame()).toBeTruthy();
  });

  it("shows site name", () => {
    const { lastFrame } = render(
      <ConfigScreen
        config={SITE_CONFIG}
        businessConfig={BUSINESS_CONFIG}
        onApprove={() => {}}
      />,
    );
    expect(lastFrame()).toContain("test-site");
  });

  it("shows base URL", () => {
    const { lastFrame } = render(
      <ConfigScreen
        config={SITE_CONFIG}
        businessConfig={BUSINESS_CONFIG}
        onApprove={() => {}}
      />,
    );
    expect(lastFrame()).toContain("https://example.com");
  });

  it("shows discovery type", () => {
    const { lastFrame } = render(
      <ConfigScreen
        config={SITE_CONFIG}
        businessConfig={BUSINESS_CONFIG}
        onApprove={() => {}}
      />,
    );
    expect(lastFrame()).toContain("category-list");
  });

  it("shows business config fields", () => {
    const { lastFrame } = render(
      <ConfigScreen
        config={SITE_CONFIG}
        businessConfig={BUSINESS_CONFIG}
        onApprove={() => {}}
      />,
    );
    expect(lastFrame()).toContain("Test Studio");
    expect(lastFrame()).toContain("Sydney");
    expect(lastFrame()).toContain("Test Region");
  });

  it("shows categories from config", () => {
    const { lastFrame } = render(
      <ConfigScreen
        config={SITE_CONFIG}
        businessConfig={BUSINESS_CONFIG}
        onApprove={() => {}}
      />,
    );
    expect(lastFrame()).toContain("Football");
    expect(lastFrame()).toContain("Cricket");
  });

  it("shows attributes", () => {
    const { lastFrame } = render(
      <ConfigScreen
        config={SITE_CONFIG}
        businessConfig={BUSINESS_CONFIG}
        onApprove={() => {}}
      />,
    );
    expect(lastFrame()).toContain("Colour");
    expect(lastFrame()).toContain("Size");
  });

  it("shows approve button", () => {
    const { lastFrame } = render(
      <ConfigScreen
        config={SITE_CONFIG}
        businessConfig={BUSINESS_CONFIG}
        onApprove={() => {}}
      />,
    );
    expect(lastFrame()).toContain("Approve");
  });
});

describe("ScrapeProgressScreen", () => {
  it("renders without crashing", () => {
    const { lastFrame } = render(
      <ScrapeProgressScreen progress={PROGRESS} productCount={42} errors={[]} />,
    );
    expect(lastFrame()).toBeTruthy();
  });

  it("shows category progress", () => {
    const { lastFrame } = render(
      <ScrapeProgressScreen progress={PROGRESS} productCount={42} errors={[]} />,
    );
    expect(lastFrame()).toContain("3 of 10");
  });

  it("shows product count", () => {
    const { lastFrame } = render(
      <ScrapeProgressScreen progress={PROGRESS} productCount={42} errors={[]} />,
    );
    expect(lastFrame()).toContain("42");
  });

  it("shows percentage", () => {
    const { lastFrame } = render(
      <ScrapeProgressScreen progress={PROGRESS} productCount={0} errors={[]} />,
    );
    expect(lastFrame()).toContain("30%");
  });

  it("shows error count when errors exist", () => {
    const errors = [{ url: "https://x.com/p", error: "timeout", retries: 3 }];
    const { lastFrame } = render(
      <ScrapeProgressScreen progress={PROGRESS} productCount={0} errors={errors} />,
    );
    expect(lastFrame()).toContain("Errors: 1");
  });

  it("hides error count when no errors", () => {
    const { lastFrame } = render(
      <ScrapeProgressScreen progress={PROGRESS} productCount={0} errors={[]} />,
    );
    expect(lastFrame()).not.toContain("Errors");
  });
});

describe("ProductReviewScreen", () => {
  it("renders without crashing", () => {
    const { lastFrame } = render(
      <ProductReviewScreen products={GROUPED_PRODUCTS} onApprove={() => {}} />,
    );
    expect(lastFrame()).toBeTruthy();
  });

  it("shows product SKUs", () => {
    const { lastFrame } = render(
      <ProductReviewScreen products={GROUPED_PRODUCTS} onApprove={() => {}} />,
    );
    expect(lastFrame()).toContain("SKU-001");
    expect(lastFrame()).toContain("SKU-002");
  });

  it("shows product names", () => {
    const { lastFrame } = render(
      <ProductReviewScreen products={GROUPED_PRODUCTS} onApprove={() => {}} />,
    );
    expect(lastFrame()).toContain("Gold Trophy");
    expect(lastFrame()).toContain("Silver Medal");
  });

  it("shows selection count", () => {
    const { lastFrame } = render(
      <ProductReviewScreen products={GROUPED_PRODUCTS} onApprove={() => {}} />,
    );
    expect(lastFrame()).toContain("2 of 2");
  });
});

describe("EnrichmentScreen", () => {
  it("renders without crashing for descriptions phase", () => {
    const { lastFrame } = render(
      <EnrichmentScreen progress={PROGRESS} phase="descriptions" />,
    );
    expect(lastFrame()).toBeTruthy();
  });

  it("renders without crashing for seo phase", () => {
    const { lastFrame } = render(
      <EnrichmentScreen progress={PROGRESS} phase="seo" />,
    );
    expect(lastFrame()).toBeTruthy();
  });

  it("shows descriptions phase label", () => {
    const { lastFrame } = render(
      <EnrichmentScreen progress={PROGRESS} phase="descriptions" />,
    );
    expect(lastFrame()).toContain("Generating descriptions");
  });

  it("shows seo phase label", () => {
    const { lastFrame } = render(
      <EnrichmentScreen progress={PROGRESS} phase="seo" />,
    );
    expect(lastFrame()).toContain("Generating SEO");
  });

  it("shows model name for descriptions", () => {
    const { lastFrame } = render(
      <EnrichmentScreen progress={PROGRESS} phase="descriptions" />,
    );
    expect(lastFrame()).toContain("Haiku");
  });

  it("shows model name for seo", () => {
    const { lastFrame } = render(
      <EnrichmentScreen progress={PROGRESS} phase="seo" />,
    );
    expect(lastFrame()).toContain("Sonnet");
  });

  it("shows batch progress", () => {
    const { lastFrame } = render(
      <EnrichmentScreen progress={PROGRESS} phase="descriptions" />,
    );
    expect(lastFrame()).toContain("3 of 10");
  });
});

describe("PreviewScreen", () => {
  it("renders without crashing", () => {
    const { lastFrame } = render(
      <PreviewScreen products={ENRICHED_PRODUCTS} onApprove={() => {}} />,
    );
    expect(lastFrame()).toBeTruthy();
  });

  it("shows product names", () => {
    const { lastFrame } = render(
      <PreviewScreen products={ENRICHED_PRODUCTS} onApprove={() => {}} />,
    );
    expect(lastFrame()).toContain("Gold Trophy");
    expect(lastFrame()).toContain("Silver Medal");
  });

  it("shows product count", () => {
    const { lastFrame } = render(
      <PreviewScreen products={ENRICHED_PRODUCTS} onApprove={() => {}} />,
    );
    expect(lastFrame()).toContain("2 of 2");
  });

  it("shows short descriptions", () => {
    const { lastFrame } = render(
      <PreviewScreen products={ENRICHED_PRODUCTS} onApprove={() => {}} />,
    );
    expect(lastFrame()).toContain("Short desc for Gold Trophy");
  });

  it("shows meta titles", () => {
    const { lastFrame } = render(
      <PreviewScreen products={ENRICHED_PRODUCTS} onApprove={() => {}} />,
    );
    expect(lastFrame()).toContain("Gold Trophy Test Region");
  });

  it("shows permalinks", () => {
    const { lastFrame } = render(
      <PreviewScreen products={ENRICHED_PRODUCTS} onApprove={() => {}} />,
    );
    expect(lastFrame()).toContain("sku-001-test");
  });
});

describe("ExportScreen", () => {
  it("renders without crashing", () => {
    const { lastFrame } = render(
      <ExportScreen filePath="/output/test.csv" rowCount={150} productCount={30} />,
    );
    expect(lastFrame()).toBeTruthy();
  });

  it("shows file path", () => {
    const { lastFrame } = render(
      <ExportScreen filePath="/output/test.csv" rowCount={150} productCount={30} />,
    );
    expect(lastFrame()).toContain("/output/test.csv");
  });

  it("shows row count", () => {
    const { lastFrame } = render(
      <ExportScreen filePath="/output/test.csv" rowCount={150} productCount={30} />,
    );
    expect(lastFrame()).toContain("150");
  });

  it("shows product count", () => {
    const { lastFrame } = render(
      <ExportScreen filePath="/output/test.csv" rowCount={150} productCount={30} />,
    );
    expect(lastFrame()).toContain("30");
  });

  it("shows export complete message", () => {
    const { lastFrame } = render(
      <ExportScreen filePath="/output/test.csv" rowCount={150} productCount={30} />,
    );
    expect(lastFrame()).toContain("Export Complete");
  });

  it("shows quit hint", () => {
    const { lastFrame } = render(
      <ExportScreen filePath="/output/test.csv" rowCount={150} productCount={30} />,
    );
    expect(lastFrame()).toContain("Exit");
  });
});
