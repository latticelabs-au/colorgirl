/**
 * Product description agent — generates short and long descriptions for
 * grouped products in batches.
 *
 * Uses Claude Haiku for fast, cheap description generation. Processes up
 * to 100 products per API call.
 */

import type { GroupedProduct } from "../pipeline/models.js";
import { executeAgent, parseJsonResponse } from "./executor.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = "claude-haiku-4-5-20251001";
const BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductDescription {
  parentSku: string;
  shortDescription: string;
  longDescription: string;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a product description writer for an Australian trophy and awards supplier. Generate descriptions for products used on their WooCommerce store.

For each product you receive, generate:

1. shortDescription: A single sentence that is descriptive and structural. Describe what the product physically is, its key features, and suitability. Do not use marketing language.

2. longDescription: Up to 5 dot points covering:
   - What the product is (type, style)
   - Available sizes and/or colours
   - Material composition
   - Whether an engraving plate is included
   - Suitability (what events/occasions it's appropriate for)

Style rules:
- Restrained, structural, non-marketing tone
- Do not include location information in descriptions
- Do not repeat the product name excessively
- Mention the keyword only once in descriptions
- Use "dot points" format for long description (HTML <ul><li> tags)
- Keep descriptions factual and concise
- The long description must differ from the meta_description (SEO field generated separately)

IMPORTANT: Respond with ONLY a valid JSON array. Each element must have:
{ "parentSku": string, "shortDescription": string, "longDescription": string }

No markdown fences, no explanation, just the JSON array.`;

// ---------------------------------------------------------------------------
// buildProductSummary
// ---------------------------------------------------------------------------

/**
 * Build a compact summary of a product for the prompt.
 * Includes only the fields the description agent needs.
 */
function buildProductSummary(product: GroupedProduct): Record<string, unknown> {
  return {
    parentSku: product.parentSku,
    name: product.name,
    categoryPath: product.categoryPath,
    attributeValues: product.attributeValues,
    variationCount: product.variations.length,
    type: product.type,
  };
}

// ---------------------------------------------------------------------------
// generateDescriptions
// ---------------------------------------------------------------------------

/**
 * Generate short and long descriptions for a batch of products.
 *
 * Splits products into batches of BATCH_SIZE and sends each batch to
 * Claude Haiku. Results from all batches are concatenated.
 *
 * @throws Error if the response cannot be parsed as valid JSON
 * @throws Error if any description entry is missing required fields
 */
export async function generateDescriptions(
  products: GroupedProduct[],
): Promise<ProductDescription[]> {
  if (products.length === 0) return [];

  const allDescriptions: ProductDescription[] = [];

  // Process in batches
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const summaries = batch.map(buildProductSummary);

    const prompt = `Generate descriptions for these ${batch.length} products:\n\n${JSON.stringify(summaries, null, 2)}`;

    const response = await executeAgent(prompt, {
      model: MODEL,
      systemPrompt: SYSTEM_PROMPT,
    });

    let parsed: unknown;
    try {
      parsed = parseJsonResponse<unknown>(response.text);
    } catch {
      throw new Error(
        `Failed to parse description JSON from agent response: ${response.text.slice(0, 200)}`,
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error("Description agent response is not an array");
    }

    const descriptions = parsed as ProductDescription[];

    // Validate each entry
    for (const desc of descriptions) {
      if (!desc.parentSku || !desc.shortDescription || !desc.longDescription) {
        throw new Error(
          `Description entry missing required fields: ${JSON.stringify(desc).slice(0, 200)}`,
        );
      }
    }

    allDescriptions.push(...descriptions);
  }

  return allDescriptions;
}
