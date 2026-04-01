/**
 * Product grouper — consolidates individual scraped RawProducts (one per
 * colour/size variant) into GroupedProducts with a parent + variations model.
 */

import { RawProduct, GroupedProduct, AttributeDef } from "./models.js";
import { applyTransform } from "./transforms.js";

// ---------------------------------------------------------------------------
// GrouperConfig
// ---------------------------------------------------------------------------

export interface GrouperConfig {
  /**
   * Override the default grouping key derivation.
   * Receives a RawProduct and returns a string key. Products with the same
   * key will be consolidated into one GroupedProduct.
   * Default: deriveBaseName(product.name) + "|" + product.categoryPath.join("/")
   */
  groupKey?: (product: RawProduct) => string;

  /**
   * Attribute definitions — used to apply named transforms to attribute
   * values during grouping.
   */
  attributes?: AttributeDef[];
}

// ---------------------------------------------------------------------------
// Known colour / size tokens used for suffix stripping
// ---------------------------------------------------------------------------

const KNOWN_COLOURS = new Set([
  "gold",
  "silver",
  "bronze",
  "blue",
  "red",
  "pink",
  "green",
  "white",
  "black",
]);

// Matches a standalone size token: one or more digits optionally followed by
// a unit (mm, cm, ", inch, inches). The unit is optional so bare numbers at
// the end also qualify.
const SIZE_TOKEN_RE = /^\d+(\.\d+)?\s*(mm|cm|"|inch|inches)?$/i;

// ---------------------------------------------------------------------------
// deriveBaseName
// ---------------------------------------------------------------------------

/**
 * Strip trailing colour and size suffixes from a product name.
 *
 * Rules:
 * - Trailing words that are an exact (case-insensitive) match against
 *   KNOWN_COLOURS are removed. "Golden" is NOT removed because it contains
 *   extra characters beyond "gold".
 * - Trailing tokens that look like a size measurement (digits + optional
 *   unit) are removed.
 * - Stripping repeats until no more tokens are removable.
 *
 * @example
 * deriveBaseName("Jetstream Dance Trophy Gold 150mm") // "Jetstream Dance Trophy"
 * deriveBaseName("Star Medal Silver")                 // "Star Medal"
 * deriveBaseName("Achievement Award")                 // "Achievement Award"
 * deriveBaseName("Golden Achievement Trophy")         // "Golden Achievement Trophy"
 */
export function deriveBaseName(name: string): string {
  let words = name.trim().split(/\s+/);

  let stripped = true;
  while (stripped && words.length > 0) {
    stripped = false;
    const last = words[words.length - 1];
    if (
      KNOWN_COLOURS.has(last.toLowerCase()) ||
      SIZE_TOKEN_RE.test(last)
    ) {
      words = words.slice(0, -1);
      stripped = true;
    }
  }

  return words.join(" ");
}

// ---------------------------------------------------------------------------
// groupProducts
// ---------------------------------------------------------------------------

/**
 * Merge an array of RawProducts into GroupedProducts.
 *
 * Algorithm:
 * 1. Compute a grouping key for each product.
 * 2. Bucket products by key.
 * 3. For each bucket:
 *    a. Deduplicate by SKU (keep first occurrence).
 *    b. Apply attribute transforms if config.attributes is provided.
 *    c. Determine type: "simple" (1 product) or "variable" (2+).
 *    d. Select parentSku: lexicographically lowest SKU.
 *    e. Derive name from the base name of the first product.
 *    f. Collect distinct attribute values across all variations.
 * 4. Return array sorted by parentSku.
 */
export function groupProducts(
  products: RawProduct[],
  config: GrouperConfig = {}
): GroupedProduct[] {
  if (products.length === 0) return [];

  // ---------------------------------------------------------------------------
  // Step 1 & 2: bucket products by grouping key
  // ---------------------------------------------------------------------------
  const defaultKeyFn = (p: RawProduct): string =>
    `${deriveBaseName(p.name)}|${p.categoryPath.join("/")}`;

  const keyFn = config.groupKey ?? defaultKeyFn;
  const buckets = new Map<string, RawProduct[]>();

  for (const product of products) {
    const key = keyFn(product);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(product);
    } else {
      buckets.set(key, [product]);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 3: build a GroupedProduct for each bucket
  // ---------------------------------------------------------------------------
  const grouped: GroupedProduct[] = [];

  for (const [, bucket] of buckets) {
    // a. Deduplicate by SKU — keep only the first product for each SKU
    const seenSkus = new Set<string>();
    const deduped: RawProduct[] = [];
    for (const p of bucket) {
      if (!seenSkus.has(p.sku)) {
        seenSkus.add(p.sku);
        deduped.push(p);
      }
    }

    // b. Apply attribute transforms
    let variations: RawProduct[];
    if (config.attributes && config.attributes.length > 0) {
      variations = deduped.map((p) => {
        const transformedAttributes: Record<string, string> = {
          ...p.attributes,
        };
        for (const attrDef of config.attributes!) {
          if (attrDef.transform && attrDef.slug in transformedAttributes) {
            transformedAttributes[attrDef.slug] = applyTransform(
              transformedAttributes[attrDef.slug],
              attrDef.transform
            );
          }
        }
        return { ...p, attributes: transformedAttributes };
      });
    } else {
      variations = deduped;
    }

    // c. Determine type
    const type: "simple" | "variable" =
      variations.length === 1 ? "simple" : "variable";

    // d. Select parentSku — lexicographically lowest SKU
    const parentSku = variations
      .map((p) => p.sku)
      .sort((a, b) => a.localeCompare(b))[0];

    // e. Name — base name of the first product in the bucket
    const name = deriveBaseName(deduped[0].name) || deduped[0].name;

    // f. categoryPath — from the first product
    const categoryPath = deduped[0].categoryPath;

    // g. Collect distinct attribute values across all variations
    const attributeValues: Record<string, string[]> = {};
    for (const variation of variations) {
      for (const [slug, value] of Object.entries(variation.attributes)) {
        if (value === undefined || value === "") continue;
        if (!attributeValues[slug]) {
          attributeValues[slug] = [];
        }
        if (!attributeValues[slug].includes(value)) {
          attributeValues[slug].push(value);
        }
      }
    }

    grouped.push({ parentSku, name, type, categoryPath, variations, attributeValues });
  }

  // Step 4: sort by parentSku
  grouped.sort((a, b) => a.parentSku.localeCompare(b.parentSku));

  return grouped;
}
