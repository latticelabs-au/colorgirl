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
import type { ScrapeError } from "../../scraper/engine.js";

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
export const getScrapeErrorsQuery = defineQuery<ScrapeError[]>("getScrapeErrors");
export const getLogsQuery = defineQuery<string[]>("getLogs");

// ── Constants ───────────────────────────────────────────
const APPROVAL_TIMEOUT = "24 hours";

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
    const skip = new Set(
      (config.skipCategories ?? []).map((c) => c.toLowerCase()),
    );
    const categories: string[] = [];
    for (const section of config.discovery.sections) {
      for (const cat of section.categories) {
        if (!skip.has(cat.toLowerCase())) {
          categories.push(cat);
        }
      }
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
  const descMap = new Map(descriptions.map((d) => [d.parentSku, d]));
  const seoMap = new Map(seoData.map((s) => [s.parentSku, s]));
  return products.map((p) => {
    const desc = descMap.get(p.parentSku);
    const seo = seoMap.get(p.parentSku);
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
  let scrapeErrors: ScrapeError[] = [];
  let logs: string[] = [];

  function pushLog(msg: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    logs.push(`[${ts}] ${msg}`);
    // Keep last 50 lines
    if (logs.length > 50) logs = logs.slice(-50);
  }

  // Register query handlers
  setHandler(getStatusQuery, () => status);
  setHandler(getProductsQuery, () => groupedProducts);
  setHandler(getProgressQuery, () => progress);
  setHandler(getPreviewQuery, () => enrichedProducts);
  setHandler(getSuggestedConfigQuery, () => suggestedConfig);
  setHandler(getScrapeErrorsQuery, () => scrapeErrors);
  setHandler(getLogsQuery, () => logs);

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
    pushLog(`Starting site analysis: ${input.url}`);
    pushLog(`Using Opus agent for deep site reconnaissance...`);
    const siteConfig = await analyzeSiteActivity(input.url);
    suggestedConfig = siteConfig;
    pushLog(`Analysis complete — pipeline: ${siteConfig.pipeline}, extraction: ${siteConfig.variantExtraction.method}`);
    pushLog(`Found ${siteConfig.attributes.length} attributes, rate limit: ${siteConfig.rateLimit}ms`);

    // 2. Wait for config approval
    status = {
      phase: "awaiting-config",
      message: "Waiting for config approval...",
    };
    pushLog("Awaiting config approval...");
    const configApproved = await condition(() => approvedConfig !== null, APPROVAL_TIMEOUT);
    if (!configApproved) {
      throw new Error("Timed out waiting for config approval");
    }
    const config = approvedConfig!;

    // 3. Scrape
    status = { phase: "scraping", message: "Scraping products..." };
    pushLog(`Config approved. Starting scrape with ${config.pipeline} pipeline...`);
    const allProducts: RawProduct[] = [];
    const categories = deriveCategories(config);
    pushLog(categories.length > 0 ? `Scraping ${categories.length} categories` : "Scraping all products in one pass");

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
        scrapeErrors.push(...result.errors);
        pushLog(`Category ${i + 1}/${categories.length}: ${categories[i]} — ${result.products.length} products, ${result.errors.length} errors`);
      }
    } else {
      // No category-list discovery — scrape everything in one pass
      progress = { phase: "scraping", current: 1, total: 1, percentage: 100 };
      const result = await scrapeCategoryActivity(config);
      allProducts.push(...result.products);
      scrapeErrors.push(...result.errors);
    }

    // 4. Group products
    pushLog(`Scraping complete — ${allProducts.length} raw products, ${scrapeErrors.length} errors`);
    pushLog("Grouping variants...");
    groupedProducts = await groupProductsActivity(
      allProducts,
      config.attributes,
    );

    // 5. Wait for product approval
    pushLog(`Grouped into ${groupedProducts.length} products (${groupedProducts.filter(p => p.type === "variable").length} variable, ${groupedProducts.filter(p => p.type === "simple").length} simple)`);
    status = {
      phase: "awaiting-products",
      message: `${groupedProducts.length} products grouped. Waiting for approval...`,
    };
    const productsApproved = await condition(() => approvedSkus !== null, APPROVAL_TIMEOUT);
    if (!productsApproved) {
      throw new Error("Timed out waiting for product approval");
    }
    // Filter to approved SKUs — empty array means approve none
    groupedProducts = groupedProducts.filter((p) =>
      approvedSkus!.includes(p.parentSku),
    );

    // 6. AI enrichment
    pushLog(`${groupedProducts.length} products approved. Starting AI enrichment...`);
    pushLog("Running Haiku (descriptions) + Sonnet (SEO) in parallel...");
    status = {
      phase: "enriching",
      message: `Generating descriptions and SEO for ${groupedProducts.length} products...`,
    };
    const [descriptions, seoData] = await Promise.all([
      generateDescsActivity(groupedProducts),
      generateSeoActivity(groupedProducts, input.businessConfig),
    ]);

    // 7. Merge enrichment into products
    pushLog(`Enrichment complete — ${descriptions.length} descriptions, ${seoData.length} SEO entries`);
    enrichedProducts = mergeEnrichment(groupedProducts, descriptions, seoData);

    // 8. Wait for export approval
    status = {
      phase: "awaiting-export",
      message: "Preview ready. Waiting for export approval...",
    };
    const exportWasApproved = await condition(() => exportApproved, APPROVAL_TIMEOUT);
    if (!exportWasApproved) {
      throw new Error("Timed out waiting for export approval");
    }

    // 9. Build CSV
    pushLog("Export approved. Building WooCommerce CSV...");
    status = { phase: "exporting", message: "Building CSV..." };
    const outputPath =
      input.outputPath ?? `./output/${config.name}-${Date.now()}.csv`;
    const csvResult = await buildCsvActivity(
      enrichedProducts,
      { attributes: config.attributes },
      outputPath,
    );

    pushLog(`CSV exported: ${csvResult.rowCount} rows → ${csvResult.filePath}`);
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
