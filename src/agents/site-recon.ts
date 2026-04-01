/**
 * Site reconnaissance agent — analyses an unknown supplier website and
 * generates a SiteConfig YAML/JSON structure.
 *
 * Uses Claude Opus for complex reasoning about site structure, navigation
 * patterns, and product page layouts.
 */

import type { SiteConfig } from "../pipeline/models.js";
import { executeAgent } from "./executor.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = "claude-opus-4-6";
const MAX_TOKENS = 8192;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a web scraping expert. Your task is to analyse a supplier website and produce a SiteConfig JSON object that describes how to scrape it.

A SiteConfig has these fields:
- name (string): Machine-readable identifier derived from the domain, e.g. "trophies-com-au"
- baseUrl (string): Root URL of the site, e.g. "https://trophies.com.au"
- discovery (object): Strategy for discovering product pages. One of three types:
  - { type: "sitemap", url: string, filterPatterns: string[] } — use when the site has an XML sitemap with product URLs
  - { type: "category-list", sections: Array<{ name: string, path: string, categories: string[] }> } — use when the site has a clear category navigation structure
  - { type: "pagination", listSelector: string, nextSelector: string } — use when products are listed with pagination controls
- selectors (object): CSS selectors for scraping product page fields:
  - name (string): selector for the product name/title
  - sku (string): selector for the SKU/product code
  - price (string, optional): selector for the price
  - images (string): selector for product images
  - description (string, optional): selector for product description
  - shortDescription (string, optional): selector for short description
  - weight (string, optional): selector for weight
  - width (string, optional): selector for width
  - height (string, optional): selector for height
  - categoryBreadcrumb (string, optional): selector for breadcrumb navigation
  - extra (Record<string, string>, optional): extra selectors keyed by attribute slug
- attributes (array): Attribute definitions, each with:
  - name (string): display name, e.g. "Colour"
  - slug (string): taxonomy slug, e.g. "pa_colour"
  - isVariation (boolean): true if used for product variations
  - isGlobal (boolean): true if a WooCommerce global attribute
  - selector (string, optional): CSS selector on product page
  - transform (string, optional): named transform to apply: "strip_prefix", "reorder_colours", "replace_slashes", "format_number", "colour_cleanup"
  - sizeLabels (boolean, optional): true to auto-assign S/M/L/XL labels
- rateLimit (number): milliseconds between requests (recommended: 1000-2000)
- variants (object): Strategy for finding size/colour variants. One of:
  - { type: "same-page", containerSelector?: string } — variants are all on the same product page (swatches, dropdowns)
  - { type: "separate-pages", linkSelector: string } — each colour/size variant is a separate page with links between them
  - { type: "ajax-dropdown", dropdownSelector: string, ajaxEndpoint?: string } — variant data loaded via AJAX when dropdown changes
- categoryMap (Record<string, string>, optional): maps URL slugs to display names
- skipCategories (string[], optional): category slugs to skip during scraping

Guidelines:
- Choose the discovery strategy that best fits the site's navigation structure
- Be conservative with rate limits (at least 1000ms)
- Include only selectors you can confidently identify
- Use appropriate transforms for colour attributes (strip_prefix for "Antique X" patterns, colour_cleanup for slash-separated colours)

IMPORTANT: Respond with ONLY a valid JSON object. No markdown fences, no explanation, just the JSON.`;

// ---------------------------------------------------------------------------
// analyzeSite
// ---------------------------------------------------------------------------

/**
 * Analyse a supplier website and generate a SiteConfig.
 *
 * Sends the URL to Claude Opus with a detailed system prompt explaining
 * the SiteConfig schema and strategy options. Parses the JSON response
 * and validates required fields are present.
 *
 * @throws Error if the response cannot be parsed as valid JSON
 * @throws Error if required SiteConfig fields are missing
 */
export async function analyzeSite(url: string): Promise<SiteConfig> {
  const prompt = `Analyse this supplier website and generate a SiteConfig JSON: ${url}`;

  const response = await executeAgent(prompt, {
    model: MODEL,
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: MAX_TOKENS,
  });

  // Strip potential markdown code fences from the response
  let jsonText = response.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  let config: SiteConfig;
  try {
    config = JSON.parse(jsonText) as SiteConfig;
  } catch {
    throw new Error(
      `Failed to parse SiteConfig JSON from agent response: ${jsonText.slice(0, 200)}`,
    );
  }

  // Validate required fields
  const requiredFields: Array<keyof SiteConfig> = [
    "name",
    "baseUrl",
    "discovery",
    "selectors",
    "attributes",
    "rateLimit",
    "variants",
  ];

  for (const field of requiredFields) {
    if (config[field] === undefined || config[field] === null) {
      throw new Error(`SiteConfig missing required field: ${field}`);
    }
  }

  if (!config.selectors.name || !config.selectors.sku || !config.selectors.images) {
    throw new Error(
      "SiteConfig selectors must include at minimum: name, sku, images",
    );
  }

  return config;
}
