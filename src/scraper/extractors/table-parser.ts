import type { VisibleTableExtraction } from "../../pipeline/models.js";
import { parseHtml } from "../html-parser.js";

/**
 * Extract key-value pairs from an HTML table.
 * Expects rows with at least 2 <td> cells: key in first, value in second.
 */
export function extractTable(
  html: string,
  config: VisibleTableExtraction,
): Record<string, string> {
  const page = parseHtml(html);
  const data: Record<string, string> = {};

  page.$(config.tableSelector).find("tr").each((_, row) => {
    const cells = page.$(row).find("td");
    if (cells.length >= 2) {
      const key = page.$(cells[0]).text().trim();
      const val = page.$(cells[1]).text().trim();
      if (key) data[key] = val;
    }
  });

  return data;
}
