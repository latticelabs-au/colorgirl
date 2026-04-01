/**
 * CSV builder — generates WooCommerce-compatible CSV from enriched product data.
 * Output includes a UTF-8 BOM and uses csv-stringify for reliable escaping.
 */

import { stringify } from "csv-stringify/sync";
import type { EnrichedProduct, AttributeDef, RawProduct } from "../pipeline/models.js";
import { formatNumber } from "../pipeline/transforms.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CsvBuilderConfig {
  /** Attribute definitions — determines dynamic column structure */
  attributes: AttributeDef[];
  /** Weight unit for column header (default: "kg") */
  weightUnit?: string;
  /** Dimension unit for column header (default: "cm") */
  dimensionUnit?: string;
  /** SEO plugin: "yoast" | "rankmath" (default: "yoast") */
  seoPlugin?: "yoast" | "rankmath";
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build ordered list of column header strings. */
function buildHeaders(config: CsvBuilderConfig): string[] {
  const weightUnit = config.weightUnit ?? "kg";
  const dimensionUnit = config.dimensionUnit ?? "cm";

  const fixed = [
    "ID",
    "Type",
    "SKU",
    "Name",
    "Published",
    "Is featured?",
    "Visibility in catalog",
    "Short description",
    "Description",
    "Tax status",
    "In stock?",
    `Weight (${weightUnit})`,
    `Length (${dimensionUnit})`,
    `Width (${dimensionUnit})`,
    `Height (${dimensionUnit})`,
    "Regular price",
    "Categories",
    "Images",
    "Parent",
  ];

  const attributeHeaders: string[] = [];
  config.attributes.forEach((attr, idx) => {
    const n = idx + 1;
    attributeHeaders.push(
      `Attribute ${n} name`,
      `Attribute ${n} value(s)`,
      `Attribute ${n} visible`,
      `Attribute ${n} global`,
    );
  });

  const seoPlugin = config.seoPlugin ?? "yoast";
  const seoHeaders =
    seoPlugin === "rankmath"
      ? ["Meta: rank_math_title", "Meta: rank_math_description"]
      : ["Meta: _yoast_wpseo_title", "Meta: _yoast_wpseo_metadesc"];

  return [...fixed, ...attributeHeaders, ...seoHeaders];
}

/** Format category path as "A > B > C". */
function formatCategories(categoryPath: string[]): string {
  return categoryPath.join(" > ");
}

/** Format image URLs as a comma-separated string. */
function formatImages(images: string[]): string {
  return images.join(",");
}

/** Build the attribute columns for a parent/simple row (all values). */
function parentAttributeCells(
  product: EnrichedProduct,
  attributes: AttributeDef[],
): string[] {
  const cells: string[] = [];
  for (const attr of attributes) {
    const values = product.attributeValues[attr.slug] ?? [];
    cells.push(
      attr.name,
      values.join(", "),
      "1",
      attr.isGlobal ? "1" : "0",
    );
  }
  return cells;
}

/** Build the attribute columns for a variation row (single value per attribute). */
function variationAttributeCells(
  variation: RawProduct,
  attributes: AttributeDef[],
): string[] {
  const cells: string[] = [];
  for (const attr of attributes) {
    const value = variation.attributes[attr.slug] ?? "";
    cells.push(
      // Attribute N name — empty on variation rows per WooCommerce convention
      "",
      value,
      "1",
      attr.isGlobal ? "1" : "0",
    );
  }
  return cells;
}

/** Build a single row array from positional field values. */
function buildRow(
  headers: string[],
  fields: Record<string, string>,
): string[] {
  return headers.map((h) => fields[h] ?? "");
}

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

function buildParentRow(
  product: EnrichedProduct,
  config: CsvBuilderConfig,
  headers: string[],
): string[] {
  const seoPlugin = config.seoPlugin ?? "yoast";
  const [seoTitleCol, seoDescCol] =
    seoPlugin === "rankmath"
      ? ["Meta: rank_math_title", "Meta: rank_math_description"]
      : ["Meta: _yoast_wpseo_title", "Meta: _yoast_wpseo_metadesc"];

  // Images from first variation
  const firstVariation = product.variations[0];
  const images = firstVariation ? formatImages(firstVariation.images) : "";

  const fixedFields: Record<string, string> = {
    "ID": "",
    "Type": "variable",
    "SKU": product.parentSku,
    "Name": product.name,
    "Published": "1",
    "Is featured?": "0",
    "Visibility in catalog": "visible",
    "Short description": product.shortDescription,
    "Description": product.longDescription,
    "Tax status": "taxable",
    "In stock?": "1",
    [`Weight (${config.weightUnit ?? "kg"})`]: "",
    [`Length (${config.dimensionUnit ?? "cm"})`]: "",
    [`Width (${config.dimensionUnit ?? "cm"})`]: "",
    [`Height (${config.dimensionUnit ?? "cm"})`]: "",
    "Regular price": "",
    "Categories": formatCategories(product.categoryPath),
    "Images": images,
    "Parent": "",
    [seoTitleCol]: product.metaTitle,
    [seoDescCol]: product.metaDescription,
  };

  // Build attribute cells as positional values
  const attrCells = parentAttributeCells(product, config.attributes);
  // Map attr cells back to their header names
  config.attributes.forEach((attr, idx) => {
    const n = idx + 1;
    const offset = idx * 4;
    fixedFields[`Attribute ${n} name`] = attrCells[offset];
    fixedFields[`Attribute ${n} value(s)`] = attrCells[offset + 1];
    fixedFields[`Attribute ${n} visible`] = attrCells[offset + 2];
    fixedFields[`Attribute ${n} global`] = attrCells[offset + 3];
  });

  return buildRow(headers, fixedFields);
}

function buildVariationRow(
  product: EnrichedProduct,
  variation: RawProduct,
  config: CsvBuilderConfig,
  headers: string[],
): string[] {
  const weightKey = `Weight (${config.weightUnit ?? "kg"})`;
  const lengthKey = `Length (${config.dimensionUnit ?? "cm"})`;
  const widthKey = `Width (${config.dimensionUnit ?? "cm"})`;
  const heightKey = `Height (${config.dimensionUnit ?? "cm"})`;

  const seoPlugin = config.seoPlugin ?? "yoast";
  const [seoTitleCol, seoDescCol] =
    seoPlugin === "rankmath"
      ? ["Meta: rank_math_title", "Meta: rank_math_description"]
      : ["Meta: _yoast_wpseo_title", "Meta: _yoast_wpseo_metadesc"];

  const fixedFields: Record<string, string> = {
    "ID": "",
    "Type": "variation",
    "SKU": variation.sku,
    "Name": "",
    "Published": "1",
    "Is featured?": "0",
    "Visibility in catalog": "",
    "Short description": "",
    "Description": "",
    "Tax status": "",
    "In stock?": "",
    [weightKey]: formatNumber(variation.dimensions?.weight),
    [lengthKey]: "",
    [widthKey]: formatNumber(variation.dimensions?.width),
    [heightKey]: formatNumber(variation.dimensions?.height),
    "Regular price":
      variation.price != null ? formatNumber(variation.price) : "",
    "Categories": "",
    "Images": formatImages(variation.images),
    "Parent": product.parentSku,
    [seoTitleCol]: "",
    [seoDescCol]: "",
  };

  const attrCells = variationAttributeCells(variation, config.attributes);
  config.attributes.forEach((attr, idx) => {
    const n = idx + 1;
    const offset = idx * 4;
    fixedFields[`Attribute ${n} name`] = attrCells[offset];
    fixedFields[`Attribute ${n} value(s)`] = attrCells[offset + 1];
    fixedFields[`Attribute ${n} visible`] = attrCells[offset + 2];
    fixedFields[`Attribute ${n} global`] = attrCells[offset + 3];
  });

  return buildRow(headers, fixedFields);
}

function buildSimpleRow(
  product: EnrichedProduct,
  config: CsvBuilderConfig,
  headers: string[],
): string[] {
  const variation = product.variations[0];
  const weightKey = `Weight (${config.weightUnit ?? "kg"})`;
  const lengthKey = `Length (${config.dimensionUnit ?? "cm"})`;
  const widthKey = `Width (${config.dimensionUnit ?? "cm"})`;
  const heightKey = `Height (${config.dimensionUnit ?? "cm"})`;

  const seoPlugin = config.seoPlugin ?? "yoast";
  const [seoTitleCol, seoDescCol] =
    seoPlugin === "rankmath"
      ? ["Meta: rank_math_title", "Meta: rank_math_description"]
      : ["Meta: _yoast_wpseo_title", "Meta: _yoast_wpseo_metadesc"];

  const fixedFields: Record<string, string> = {
    "ID": "",
    "Type": "simple",
    "SKU": product.parentSku,
    "Name": product.name,
    "Published": "1",
    "Is featured?": "0",
    "Visibility in catalog": "visible",
    "Short description": product.shortDescription,
    "Description": product.longDescription,
    "Tax status": "taxable",
    "In stock?": "1",
    [weightKey]: variation ? formatNumber(variation.dimensions?.weight) : "",
    [lengthKey]: "",
    [widthKey]: variation ? formatNumber(variation.dimensions?.width) : "",
    [heightKey]: variation ? formatNumber(variation.dimensions?.height) : "",
    "Regular price":
      variation?.price != null ? formatNumber(variation.price) : "",
    "Categories": formatCategories(product.categoryPath),
    "Images": variation ? formatImages(variation.images) : "",
    "Parent": "",
    [seoTitleCol]: product.metaTitle,
    [seoDescCol]: product.metaDescription,
  };

  const attrCells = parentAttributeCells(product, config.attributes);
  config.attributes.forEach((attr, idx) => {
    const n = idx + 1;
    const offset = idx * 4;
    fixedFields[`Attribute ${n} name`] = attrCells[offset];
    fixedFields[`Attribute ${n} value(s)`] = attrCells[offset + 1];
    fixedFields[`Attribute ${n} visible`] = attrCells[offset + 2];
    fixedFields[`Attribute ${n} global`] = attrCells[offset + 3];
  });

  return buildRow(headers, fixedFields);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Build a WooCommerce-compatible CSV string from enriched products.
 * Returns UTF-8 string with BOM prepended.
 */
export function buildCsv(
  products: EnrichedProduct[],
  config: CsvBuilderConfig,
): string {
  const headers = buildHeaders(config);
  const rows: string[][] = [headers];

  for (const product of products) {
    if (product.type === "variable") {
      rows.push(buildParentRow(product, config, headers));
      for (const variation of product.variations) {
        rows.push(buildVariationRow(product, variation, config, headers));
      }
    } else {
      // simple
      rows.push(buildSimpleRow(product, config, headers));
    }
  }

  const csv = stringify(rows, { quoted_string: true });
  return "\uFEFF" + csv;
}
