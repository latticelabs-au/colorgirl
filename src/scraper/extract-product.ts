import type { SiteConfig, RawProduct } from "../pipeline/models.js";
import { parseHtml } from "./html-parser.js";
import { extractTemplateTags } from "./extractors/template-tags.js";
import { extractSelectDropdown } from "./extractors/select-dropdown.js";
import { extractTable } from "./extractors/table-parser.js";
import { extractBulletList } from "./extractors/bullet-list.js";
import { extractBreadcrumb } from "./extractors/breadcrumb.js";

/**
 * Extract RawProduct(s) from a product page's HTML.
 * Returns one product for simple items, multiple for items with variants.
 * This is the HTTP-tier replacement for the Playwright-based extractProduct().
 */
export function extractProductsFromHtml(
  html: string,
  url: string,
  config: SiteConfig,
): RawProduct[] {
  const page = parseHtml(html);
  const s = config.selectors;

  // Required fields
  const name = page.text(s.name);
  const sku = page.text(s.sku);
  if (!name) throw new Error(`Missing product name at ${url}`);
  if (!sku) throw new Error(`Missing product SKU at ${url}`);

  // Images
  const images = page.allAttr(s.images, "src");

  // Optional fields
  const description = s.description ? page.optionalText(s.description) : undefined;
  const shortDescription = s.shortDescription ? page.optionalText(s.shortDescription) : undefined;
  const price = s.price ? page.optionalNumber(s.price) : undefined;

  // Dimensions
  const weight = s.weight ? page.optionalNumber(s.weight) : undefined;
  const width = s.width ? page.optionalNumber(s.width) : undefined;
  const height = s.height ? page.optionalNumber(s.height) : undefined;
  const dimensions = (weight !== undefined || width !== undefined || height !== undefined)
    ? { weight, width, height }
    : undefined;

  // Category breadcrumb
  const categoryPath = s.categoryBreadcrumb
    ? extractBreadcrumb(html, s.categoryBreadcrumb)
    : [];

  // Extra attributes
  const attributes: Record<string, string> = {};
  if (s.extra) {
    for (const [slug, selector] of Object.entries(s.extra)) {
      const val = page.optionalText(selector);
      if (val) attributes[slug] = val;
    }
  }

  const now = new Date().toISOString();

  // Base product fields shared by all variants
  const base = {
    name,
    sourceUrl: url,
    categoryPath,
    attributes,
    price,
    images,
    dimensions,
    description,
    shortDescription,
    scrapedAt: now,
  };

  // Variant extraction
  const ve = config.variantExtraction;

  if (ve.method === "template-tags") {
    const variants = extractTemplateTags(html, ve);
    if (variants.length > 0) {
      return variants.map((v) => ({
        ...base,
        sku: v.sku,
        attributes: { ...attributes, ...v.data },
      }));
    }
  }

  if (ve.method === "select-dropdown") {
    const variants = extractSelectDropdown(html, ve, sku);
    if (variants.length > 1) {
      return variants.map((v) => ({
        ...base,
        sku: v.sku,
        attributes: { ...attributes, _optionValue: v.optionValue, _optionText: v.optionText },
      }));
    }
  }

  if (ve.method === "bullet-list") {
    const data = extractBulletList(html, ve);
    return [{ ...base, sku, attributes: { ...attributes, ...data } }];
  }

  if (ve.method === "visible-table") {
    const data = extractTable(html, ve);
    return [{ ...base, sku, attributes: { ...attributes, ...data } }];
  }

  // Default: single product, no variant extraction
  return [{ ...base, sku }];
}
