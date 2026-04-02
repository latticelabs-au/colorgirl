import type { SelectDropdownExtraction } from "../../pipeline/models.js";
import { parseHtml } from "../html-parser.js";

export interface DropdownVariant {
  sku: string;
  optionValue: string;
  optionText: string;
}

/**
 * Extract variant options from a <select> dropdown.
 * SKU inference determines how to derive variant SKUs from options.
 */
export function extractSelectDropdown(
  html: string,
  config: SelectDropdownExtraction,
  baseSku: string,
): DropdownVariant[] {
  const page = parseHtml(html);
  const results: DropdownVariant[] = [];

  page.$(config.dropdownSelector).find("option").each((idx, el) => {
    const optionValue = page.$(el).attr("value") ?? "";
    const optionText = page.$(el).text().trim();
    if (!optionValue || !optionText) return;

    let sku: string;
    switch (config.skuInference) {
      case "increment-last-letter":
        sku = idx === 0
          ? baseSku
          : baseSku.slice(0, -1) + String.fromCharCode(baseSku.charCodeAt(baseSku.length - 1) + idx);
        break;
      case "from-option-value":
        sku = optionValue;
        break;
      case "from-option-data":
        sku = page.$(el).attr("data-sku") ?? optionValue;
        break;
    }

    results.push({ sku, optionValue, optionText });
  });

  return results;
}
