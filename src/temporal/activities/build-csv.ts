import { buildCsv } from "../../export/csv-builder.js";
import type { EnrichedProduct } from "../../pipeline/models.js";
import type { CsvBuilderConfig } from "../../export/csv-builder.js";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

export interface BuildCsvResult {
  filePath: string;
  rowCount: number;
  productCount: number;
}

/** Temporal activity: build WooCommerce CSV and write to disk */
export async function buildCsvActivity(
  products: EnrichedProduct[],
  config: CsvBuilderConfig,
  outputPath: string,
): Promise<BuildCsvResult> {
  const csv = buildCsv(products, config);

  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, csv, "utf-8");

  // Count rows (subtract header)
  const rowCount = csv.split("\n").filter((l) => l.trim()).length - 1;

  return {
    filePath: outputPath,
    rowCount,
    productCount: products.length,
  };
}
