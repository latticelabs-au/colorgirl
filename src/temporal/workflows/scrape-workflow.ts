import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
} from "@temporalio/workflow";

// Import activity types (not implementations — Temporal proxies them)
import type * as activities from "../activities/index.js";
import type {
  SiteConfig,
  RawProduct,
  GroupedProduct,
  EnrichedProduct,
  BusinessConfig,
} from "../../pipeline/models.js";

const {
  analyzeSiteActivity,
  scrapeCategoryActivity,
  groupProductsActivity,
  generateDescsActivity,
  generateSeoActivity,
  buildCsvActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
});

// ── Signals (TUI -> Workflow) ────────────────────────────
export const configApprovedSignal =
  defineSignal<[SiteConfig]>("configApproved");
export const productsApprovedSignal =
  defineSignal<[string[]]>("productsApproved"); // selected SKUs
export const exportApprovedSignal = defineSignal("exportApproved");

// ── Queries (TUI polls Workflow) ─────────────────────────
export const getStatusQuery = defineQuery<WorkflowStatus>("getStatus");
export const getProductsQuery = defineQuery<GroupedProduct[]>("getProducts");
export const getProgressQuery = defineQuery<WorkflowProgress>("getProgress");
export const getPreviewQuery = defineQuery<EnrichedProduct[]>("getPreview");
export const getSuggestedConfigQuery =
  defineQuery<SiteConfig | null>("getSuggestedConfig");

// ── Types ────────────────────────────────────────────────
export interface WorkflowStatus {
  phase:
    | "analyzing"
    | "awaiting-config"
    | "scraping"
    | "awaiting-products"
    | "enriching"
    | "awaiting-export"
    | "exporting"
    | "complete"
    | "error";
  message?: string;
}

export interface WorkflowProgress {
  phase: string;
  current: number;
  total: number;
  percentage: number;
}

export interface ScrapeWorkflowInput {
  url: string;
  businessConfig: BusinessConfig;
  outputPath?: string;
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Derive the list of category identifiers to scrape from a SiteConfig.
 * For category-list discovery, returns the category names from all sections.
 * For other strategies, returns an empty array (scrape everything).
 */
function deriveCategories(config: SiteConfig): string[] {
  if (config.discovery.type === "category-list") {
    const categories: string[] = [];
    for (const section of config.discovery.sections) {
      categories.push(...section.categories);
    }
    return categories;
  }
  return [];
}

/**
 * Merge AI descriptions and SEO data into grouped products to produce
 * enriched products. Exported for unit testing.
 */
export function mergeEnrichment(
  products: GroupedProduct[],
  descriptions: Array<{ parentSku: string; shortDescription: string; longDescription: string }>,
  seoData: Array<{
    parentSku: string;
    metaTitle: string;
    metaDescription: string;
    permalink: string;
    keywords: string;
  }>,
): EnrichedProduct[] {
  return products.map((p) => {
    const desc = descriptions.find((d) => d.parentSku === p.parentSku);
    const seo = seoData.find((s) => s.parentSku === p.parentSku);
    return {
      ...p,
      shortDescription: desc?.shortDescription ?? "",
      longDescription: desc?.longDescription ?? "",
      metaTitle: seo?.metaTitle ?? "",
      metaDescription: seo?.metaDescription ?? "",
      permalink: seo?.permalink ?? "",
      keywords: seo?.keywords ?? "",
    };
  });
}

// ── Workflow ─────────────────────────────────────────────
export async function scrapeWorkflow(
  input: ScrapeWorkflowInput,
): Promise<string> {
  // State
  let status: WorkflowStatus = { phase: "analyzing" };
  let progress: WorkflowProgress = {
    phase: "",
    current: 0,
    total: 0,
    percentage: 0,
  };
  let suggestedConfig: SiteConfig | null = null;
  let approvedConfig: SiteConfig | null = null;
  let groupedProducts: GroupedProduct[] = [];
  let enrichedProducts: EnrichedProduct[] = [];
  let approvedSkus: string[] | null = null;
  let exportApproved = false;

  // Register query handlers
  setHandler(getStatusQuery, () => status);
  setHandler(getProductsQuery, () => groupedProducts);
  setHandler(getProgressQuery, () => progress);
  setHandler(getPreviewQuery, () => enrichedProducts);
  setHandler(getSuggestedConfigQuery, () => suggestedConfig);

  // Register signal handlers
  setHandler(configApprovedSignal, (config) => {
    approvedConfig = config;
  });
  setHandler(productsApprovedSignal, (skus) => {
    approvedSkus = skus;
  });
  setHandler(exportApprovedSignal, () => {
    exportApproved = true;
  });

  try {
    // 1. Analyse site
    status = { phase: "analyzing", message: `Analysing ${input.url}...` };
    const siteConfig = await analyzeSiteActivity(input.url);
    suggestedConfig = siteConfig;

    // 2. Wait for config approval
    status = {
      phase: "awaiting-config",
      message: "Waiting for config approval...",
    };
    await condition(() => approvedConfig !== null);
    const config = approvedConfig!;

    // 3. Scrape
    status = { phase: "scraping", message: "Scraping products..." };
    const allProducts: RawProduct[] = [];
    const categories = deriveCategories(config);

    if (categories.length > 0) {
      for (let i = 0; i < categories.length; i++) {
        progress = {
          phase: "scraping",
          current: i + 1,
          total: categories.length,
          percentage: Math.round(((i + 1) / categories.length) * 100),
        };
        const result = await scrapeCategoryActivity(config, categories[i]);
        allProducts.push(...result.products);
      }
    } else {
      // No category-list discovery — scrape everything in one pass
      progress = { phase: "scraping", current: 1, total: 1, percentage: 100 };
      const result = await scrapeCategoryActivity(config);
      allProducts.push(...result.products);
    }

    // 4. Group products
    groupedProducts = await groupProductsActivity(
      allProducts,
      config.attributes,
    );

    // 5. Wait for product approval
    status = {
      phase: "awaiting-products",
      message: `${groupedProducts.length} products grouped. Waiting for approval...`,
    };
    await condition(() => approvedSkus !== null);
    // Filter to approved SKUs
    if (approvedSkus!.length > 0) {
      groupedProducts = groupedProducts.filter((p) =>
        approvedSkus!.includes(p.parentSku),
      );
    }

    // 6. AI enrichment
    status = {
      phase: "enriching",
      message: `Generating descriptions and SEO for ${groupedProducts.length} products...`,
    };
    const descriptions = await generateDescsActivity(groupedProducts);
    const seoData = await generateSeoActivity(
      groupedProducts,
      input.businessConfig,
    );

    // 7. Merge enrichment into products
    enrichedProducts = mergeEnrichment(groupedProducts, descriptions, seoData);

    // 8. Wait for export approval
    status = {
      phase: "awaiting-export",
      message: "Preview ready. Waiting for export approval...",
    };
    await condition(() => exportApproved);

    // 9. Build CSV
    status = { phase: "exporting", message: "Building CSV..." };
    const outputPath =
      input.outputPath ?? `./output/${config.name}-${Date.now()}.csv`;
    const csvResult = await buildCsvActivity(
      enrichedProducts,
      { attributes: config.attributes },
      outputPath,
    );

    status = {
      phase: "complete",
      message: `Exported ${csvResult.rowCount} rows to ${csvResult.filePath}`,
    };
    return csvResult.filePath;
  } catch (error) {
    status = { phase: "error", message: String(error) };
    throw error;
  }
}
