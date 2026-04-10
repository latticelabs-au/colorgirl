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
// Split group detection
// ---------------------------------------------------------------------------

function splitIfInconsistent(
  products: RawProduct[],
  attributes?: AttributeDef[]
): { consistent: RawProduct[]; outliers: RawProduct[][] } | null {
  const varAttrs = attributes?.filter((a) => a.isVariation) ?? [];
  if (varAttrs.length === 0 || products.length < 4) return null;

  const firstVarSlug = varAttrs[0].slug;
  const byVar = new Map<string, RawProduct[]>();
  for (const p of products) {
    const val = p.attributes[firstVarSlug] ?? "";
    if (!byVar.has(val)) byVar.set(val, []);
    byVar.get(val)!.push(p);
  }

  if (byVar.size < 2) return null;

  const counts = [...byVar.values()].map((g) => g.length);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);

  if (minCount === 0 || maxCount / minCount <= 3) return null;

  const freq = new Map<number, number>();
  for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
  const modeCount = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const consistent: RawProduct[] = [];
  const outliers: RawProduct[][] = [];
  for (const [, group] of byVar) {
    if (group.length === modeCount) {
      consistent.push(...group);
    } else {
      outliers.push(group);
    }
  }

  return outliers.length > 0 ? { consistent, outliers } : null;
}

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
 *    b. Check for inconsistent variation counts (split detection).
 *    c. If split needed, push sub-groups onto a pending queue.
 *    d. Otherwise, build a GroupedProduct directly.
 * 4. Process the pending queue (no further split checks).
 * 5. Return array sorted by parentSku.
 */
export function groupProducts(
  products: RawProduct[],
  config: GrouperConfig = {}
): GroupedProduct[] {
  if (products.length === 0) return [];

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

  const grouped: GroupedProduct[] = [];
  const pending: RawProduct[][] = [];

  for (const [, bucket] of buckets) {
    const deduped = deduplicateBySku(bucket);

    const splitResult = splitIfInconsistent(deduped, config.attributes);
    if (splitResult) {
      if (splitResult.consistent.length > 0) pending.push(splitResult.consistent);
      for (const outlier of splitResult.outliers) pending.push(outlier);
      continue;
    }

    grouped.push(processBucket(deduped, config));
  }

  for (const subGroup of pending) {
    grouped.push(processBucket(subGroup, config));
  }

  grouped.sort((a, b) => a.parentSku.localeCompare(b.parentSku));

  return grouped;
}

function deduplicateBySku(products: RawProduct[]): RawProduct[] {
  const seen = new Set<string>();
  const result: RawProduct[] = [];
  for (const p of products) {
    if (!seen.has(p.sku)) {
      seen.add(p.sku);
      result.push(p);
    }
  }
  return result;
}

function processBucket(
  deduped: RawProduct[],
  config: GrouperConfig
): GroupedProduct {
  // Apply attribute transforms (always shallow-clone to avoid mutating originals)
  const variations: RawProduct[] = deduped.map((p) => {
    const attrs = { ...p.attributes };
    if (config.attributes) {
      for (const attrDef of config.attributes) {
        if (attrDef.transform && attrDef.slug in attrs) {
          attrs[attrDef.slug] = applyTransform(attrs[attrDef.slug], attrDef.transform);
        }
      }
    }
    return { ...p, attributes: attrs };
  });

  const type: "simple" | "variable" =
    variations.length === 1 ? "simple" : "variable";

  const parentSku = variations
    .map((p) => p.sku)
    .sort((a, b) => a.localeCompare(b))[0];

  const name = deriveBaseName(deduped[0].name) || deduped[0].name;
  const categoryPath = [...variations[0].categoryPath];

  const attributeValues: Record<string, string[]> = {};
  const seenAttrValues: Record<string, Set<string>> = {};
  for (const variation of variations) {
    for (const [slug, value] of Object.entries(variation.attributes)) {
      if (value === undefined || value === "") continue;
      if (!seenAttrValues[slug]) {
        seenAttrValues[slug] = new Set();
        attributeValues[slug] = [];
      }
      if (!seenAttrValues[slug].has(value)) {
        seenAttrValues[slug].add(value);
        attributeValues[slug].push(value);
      }
    }
  }

  return { parentSku, name, type, categoryPath, variations, attributeValues };
}
