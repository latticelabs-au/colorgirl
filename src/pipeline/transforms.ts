/**
 * Pure data transformation functions used during the scraping pipeline.
 * All functions are stateless and have no side effects.
 */

// ---------------------------------------------------------------------------
// stripPrefix
// ---------------------------------------------------------------------------

/**
 * Remove a prefix from a value, then trim whitespace.
 * Primary use: stripping "Antique" from colour names.
 */
export function stripPrefix(value: string, prefix: string): string {
  if (value.startsWith(prefix)) {
    return value.slice(prefix.length).trimStart();
  }
  return value;
}

// ---------------------------------------------------------------------------
// reorderColours
// ---------------------------------------------------------------------------

const TRAILING_COLOURS = ["silver", "gold"];

/**
 * Reorder slash-separated colour lists so Silver and Gold always come last.
 * Relative order among trailing colours is preserved (Silver before Gold if
 * both present unless the original order differed — they appear in the order
 * they were originally encountered among the trailing set).
 */
export function reorderColours(value: string): string {
  const parts = value.split(" / ");
  const trailing: string[] = [];
  const leading: string[] = [];

  for (const part of parts) {
    if (TRAILING_COLOURS.includes(part.trim().toLowerCase())) {
      trailing.push(part);
    } else {
      leading.push(part);
    }
  }

  return [...leading, ...trailing].join(" / ");
}

// ---------------------------------------------------------------------------
// replaceSlashes
// ---------------------------------------------------------------------------

/**
 * Replace forward slashes (with surrounding spaces) with ampersands.
 */
export function replaceSlashes(value: string): string {
  return value.replace(/ \/ /g, " & ");
}

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------

/**
 * Strip units and return a whole number string (no .0 decimals).
 * Rounds to the nearest integer. Returns "" for empty or non-numeric input.
 */
export function formatNumber(value: string | number | null | undefined): string {
  if (value === "" || value === null || value === undefined) return "";

  const str = String(value).trim();
  if (str === "") return "";

  // Extract the numeric portion (handles units like "mm", "g", spaces)
  const match = str.match(/^-?[\d.]+/);
  if (!match) return "";

  const num = parseFloat(match[0]);
  if (isNaN(num)) return "";

  return String(Math.round(num));
}

// ---------------------------------------------------------------------------
// assignSizeLabels
// ---------------------------------------------------------------------------

const SIZE_SEQUENCE = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

// Precomputed windows into SIZE_SEQUENCE for each variant count (index = count).
// count 0,1 → [] handled separately; count 2 → S,L handled separately.
// count 3-8: slice bounds [start, end] (inclusive) into SIZE_SEQUENCE.
// Pattern: right end grows first (L→XL), then left end shrinks (XS), then
// right grows again (XXL), then left shrinks (XXS), then right grows (XXXL).
//   3 → S M L        [2,4]
//   4 → S M L XL     [2,5]
//   5 → XS S M L XL  [1,5]
//   6 → XS S M L XL XXL [1,6]
//   7 → XXS XS S M L XL XXL [0,6]
//   8 → XXS XS S M L XL XXL XXXL [0,7]
const SIZE_WINDOWS: Array<[number, number]> = [
  [2, 4], // 3 variants
  [2, 5], // 4 variants
  [1, 5], // 5 variants
  [1, 6], // 6 variants
  [0, 6], // 7 variants
  [0, 7], // 8 variants
];

/**
 * Map a variant count to the S/M/L/XL size labelling scheme.
 * Smallest label is S for counts 2-4; larger counts expand outward into XS/XXS.
 * Returns [] when only 0 or 1 variant exists.
 */
export function assignSizeLabels(variantCount: number): string[] {
  if (variantCount <= 1) return [];
  if (variantCount === 2) return ["S", "L"];

  const windowIndex = Math.min(variantCount - 3, SIZE_WINDOWS.length - 1);
  const [start, end] = SIZE_WINDOWS[windowIndex];
  return SIZE_SEQUENCE.slice(start, end + 1);
}

// ---------------------------------------------------------------------------
// formatDimensions
// ---------------------------------------------------------------------------

export interface DimensionEntry {
  label: string;
  value: string;
}

/**
 * Format engraving plate or medal size dimensions with size labels and ranges.
 *
 * - Single entry → just the value
 * - All same value → just the value (no labels needed)
 * - Multiple entries with consecutive ranges sharing a value → "S - L: value | XL: value"
 * - Otherwise → "S: value | M: value | ..."
 */
export function formatDimensions(dimensions: DimensionEntry[]): string {
  if (dimensions.length === 0) return "";
  if (dimensions.length === 1) return dimensions[0].value;

  // Check if all values are the same
  const allSame = dimensions.every((d) => d.value === dimensions[0].value);
  if (allSame) return dimensions[0].value;

  // Group consecutive entries sharing the same value
  const groups: Array<{ labels: string[]; value: string }> = [];
  let current = { labels: [dimensions[0].label], value: dimensions[0].value };

  for (let i = 1; i < dimensions.length; i++) {
    const d = dimensions[i];
    if (d.value === current.value) {
      current.labels.push(d.label);
    } else {
      groups.push(current);
      current = { labels: [d.label], value: d.value };
    }
  }
  groups.push(current);

  return groups
    .map((g) => {
      const labelPart =
        g.labels.length === 1
          ? g.labels[0]
          : `${g.labels[0]} - ${g.labels[g.labels.length - 1]}`;
      return `${labelPart}: ${g.value}`;
    })
    .join(" | ");
}

// ---------------------------------------------------------------------------
// stripUnits
// ---------------------------------------------------------------------------

/**
 * Remove trailing unit suffixes (g, mm, cm, etc.) from a value string.
 * For dimension/weight fields where the unit is in the column header.
 */
export function stripUnits(value: string): string {
  if (!value) return "";
  return value.trim().replace(/\s*[a-zA-Z]+$/, "");
}

// ---------------------------------------------------------------------------
// applyTransform
// ---------------------------------------------------------------------------

/**
 * Dispatcher that applies a named transform to a value.
 * Called by the pipeline when processing AttributeDef.transform values.
 * Unknown transform names return the value unchanged.
 *
 * Composite transforms (transforms that chain multiple steps):
 *   "colour_cleanup" — reorderColours then replaceSlashes. Use this on colour
 *   attributes instead of applying the two transforms separately, so that
 *   Silver/Gold are pushed to the end before " / " is converted to " & ".
 */
export function applyTransform(value: string, transformName: string): string {
  switch (transformName) {
    case "strip_prefix":
      return stripPrefix(value, "Antique");
    case "reorder_colours":
      return reorderColours(value);
    case "replace_slashes":
      return replaceSlashes(value);
    case "format_number":
      return formatNumber(value);
    case "colour_cleanup":
      return replaceSlashes(reorderColours(value));
    case "strip_units":
      return stripUnits(value);
    default:
      return value;
  }
}
