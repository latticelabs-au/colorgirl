/**
 * SEO generation agent — produces meta titles, descriptions, permalinks,
 * and keywords for grouped products.
 *
 * Uses Claude Sonnet for balanced quality and speed on SEO content.
 * Applies business config templates for consistent branding.
 */

import type { GroupedProduct, BusinessConfig } from "../pipeline/models.js";
import { executeAgent, parseJsonResponse } from "./executor.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = "claude-sonnet-4-6";
const BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductSeo {
  parentSku: string;
  metaTitle: string;
  metaDescription: string;
  permalink: string;
  keywords: string;
}

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

/**
 * Build the SEO system prompt incorporating the business config templates.
 */
function buildSystemPrompt(businessConfig: BusinessConfig): string {
  return `You are an SEO specialist for an Australian trophy and awards supplier. Generate SEO fields for products on their WooCommerce store.

Business context:
- Business: ${businessConfig.name}
- Location: ${businessConfig.location}
- Region: ${businessConfig.region}

For each product, generate:

1. metaTitle: Use this format: "${businessConfig.seoTemplates.metaTitle}"
   - Capitalize the first letter of every word
   - Replace {keywords} with the SEO keyword for the product
   - Replace {region} with "${businessConfig.region}"
   - Replace {productName} with the product name

2. metaDescription: Use this format: "${businessConfig.seoTemplates.metaDescription}"
   - First sentence: describe the product concisely
   - Second sentence: "Prepared locally in ${businessConfig.location} for ${businessConfig.region} {keywords}."
   - The meta_description must be different from the product's long description
   - Keep under 160 characters total

3. permalink: A URL-friendly slug for the product
   - Must end with the SEO keyword
   - Use lowercase, hyphens only, no special characters
   - Example: "jetstream-dance-trophies"

4. keywords: The primary SEO keyword for this product category
   - Should match the product type + category (e.g. "dance trophies", "swimming medals")
   - Lowercase

IMPORTANT: Respond with ONLY a valid JSON array. Each element must have:
{ "parentSku": string, "metaTitle": string, "metaDescription": string, "permalink": string, "keywords": string }

No markdown fences, no explanation, just the JSON array.`;
}

// ---------------------------------------------------------------------------
// buildProductSummary
// ---------------------------------------------------------------------------

/**
 * Build a compact summary of a product for the SEO prompt.
 */
function buildProductSummary(product: GroupedProduct): Record<string, unknown> {
  return {
    parentSku: product.parentSku,
    name: product.name,
    categoryPath: product.categoryPath,
    type: product.type,
    attributeValues: product.attributeValues,
    variationCount: product.variations.length,
  };
}

// ---------------------------------------------------------------------------
// generateSeo
// ---------------------------------------------------------------------------

/**
 * Generate SEO fields for a list of products.
 *
 * Sends all products plus the business config to Claude Sonnet.
 * The agent uses the config templates to produce consistent meta titles,
 * descriptions, permalinks, and keywords.
 *
 * @throws Error if the response cannot be parsed as valid JSON
 * @throws Error if any SEO entry is missing required fields
 */
export async function generateSeo(
  products: GroupedProduct[],
  businessConfig: BusinessConfig,
): Promise<ProductSeo[]> {
  if (products.length === 0) return [];

  const allSeoData: ProductSeo[] = [];
  const systemPrompt = buildSystemPrompt(businessConfig);

  // Process in batches
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const summaries = batch.map(buildProductSummary);

    const prompt = `Generate SEO fields for these ${batch.length} products:\n\n${JSON.stringify(summaries, null, 2)}`;

    const response = await executeAgent(prompt, {
      model: MODEL,
      systemPrompt,
    });

    let parsed: unknown;
    try {
      parsed = parseJsonResponse<unknown>(response.text);
    } catch {
      throw new Error(
        `Failed to parse SEO JSON from agent response: ${response.text.slice(0, 200)}`,
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error("SEO agent response is not an array");
    }

    const seoData = parsed as ProductSeo[];

    // Validate each entry
    for (const entry of seoData) {
      if (
        !entry.parentSku ||
        !entry.metaTitle ||
        !entry.metaDescription ||
        !entry.permalink ||
        !entry.keywords
      ) {
        throw new Error(
          `SEO entry missing required fields: ${JSON.stringify(entry).slice(0, 200)}`,
        );
      }
    }

    allSeoData.push(...seoData);
  }

  return allSeoData;
}
