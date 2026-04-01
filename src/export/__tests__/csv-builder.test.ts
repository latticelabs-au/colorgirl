import { describe, it, expect } from "vitest";
import { buildCsv, CsvBuilderConfig } from "../csv-builder.js";
import type { EnrichedProduct, AttributeDef, RawProduct } from "../../pipeline/models.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const colourAttr: AttributeDef = {
  name: "Colour",
  slug: "pa_colour",
  isVariation: true,
  isGlobal: true,
};

const sizeAttr: AttributeDef = {
  name: "Size",
  slug: "pa_size",
  isVariation: true,
  isGlobal: false,
};

const baseConfig: CsvBuilderConfig = {
  attributes: [colourAttr],
};

const makeSimpleProduct = (overrides: Partial<EnrichedProduct> = {}): EnrichedProduct => ({
  parentSku: "TROPHY-001",
  name: "Gold Star Trophy",
  type: "simple",
  categoryPath: ["Trophies", "Football"],
  variations: [
    {
      sku: "TROPHY-001-GOLD",
      name: "Gold Star Trophy - Gold",
      sourceUrl: "https://example.com/trophy-001-gold",
      categoryPath: ["Trophies", "Football"],
      attributes: { pa_colour: "Gold" },
      price: 25,
      images: ["https://example.com/img/trophy-gold.jpg"],
      dimensions: { weight: 150, width: 80, height: 200 },
      scrapedAt: "2026-04-01T00:00:00Z",
    },
  ],
  attributeValues: { pa_colour: ["Gold"] },
  shortDescription: "A gleaming gold star trophy.",
  longDescription: "• Gold star trophy\n• 200mm height\n• Resin material",
  metaTitle: "Football Trophies Inner West | Gold Star Trophy",
  metaDescription: "A gold star trophy for football champions. Prepared locally in Sydney NSW for Inner West football trophies.",
  permalink: "gold-star-football-trophies",
  keywords: "football trophies",
  ...overrides,
});

const makeVariableProduct = (): EnrichedProduct => ({
  parentSku: "MEDAL-100",
  name: "Swim Club Medal",
  type: "variable",
  categoryPath: ["Medals", "Swimming"],
  variations: [
    {
      sku: "MEDAL-100-SILVER",
      name: "Swim Club Medal - Silver",
      sourceUrl: "https://example.com/medal-100-silver",
      categoryPath: ["Medals", "Swimming"],
      attributes: { pa_colour: "Silver" },
      price: 10,
      images: [
        "https://example.com/img/medal-silver-1.jpg",
        "https://example.com/img/medal-silver-2.jpg",
      ],
      dimensions: { weight: 50, width: 60, height: 60 },
      scrapedAt: "2026-04-01T00:00:00Z",
    },
    {
      sku: "MEDAL-100-GOLD",
      name: "Swim Club Medal - Gold",
      sourceUrl: "https://example.com/medal-100-gold",
      categoryPath: ["Medals", "Swimming"],
      attributes: { pa_colour: "Gold" },
      price: 12,
      images: ["https://example.com/img/medal-gold-1.jpg"],
      dimensions: { weight: 50, width: 60, height: 60 },
      scrapedAt: "2026-04-01T00:00:00Z",
    },
  ],
  attributeValues: { pa_colour: ["Silver", "Gold"] },
  shortDescription: "A prestigious swim club medal.",
  longDescription: "• Swim club medal\n• Available in Silver and Gold\n• Zinc alloy",
  metaTitle: "Swimming Medals Inner West | Swim Club Medal",
  metaDescription: "A zinc alloy swim club medal. Prepared locally in Sydney NSW for Inner West swimming medals.",
  permalink: "swim-club-swimming-medals",
  keywords: "swimming medals",
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal RFC 4180-compliant CSV parser.
 * Strips BOM from the first character, then parses all records.
 * Handles quoted fields (including embedded newlines and doubled quotes).
 */
function parseCsv(csv: string): string[][] {
  const content = csv.startsWith("\uFEFF") ? csv.slice(1) : csv;
  const records: string[][] = [];
  let pos = 0;
  const len = content.length;

  while (pos < len) {
    const record: string[] = [];

    // Parse one record (row)
    while (pos < len) {
      let field = "";

      if (content[pos] === '"') {
        // Quoted field
        pos++; // skip opening quote
        while (pos < len) {
          if (content[pos] === '"') {
            if (pos + 1 < len && content[pos + 1] === '"') {
              // Escaped quote
              field += '"';
              pos += 2;
            } else {
              pos++; // skip closing quote
              break;
            }
          } else {
            field += content[pos++];
          }
        }
      } else {
        // Unquoted field — read until comma or newline
        while (pos < len && content[pos] !== "," && content[pos] !== "\n" && content[pos] !== "\r") {
          field += content[pos++];
        }
      }

      record.push(field);

      if (pos < len && content[pos] === ",") {
        pos++; // advance past comma, continue reading fields
        continue;
      }
      // End of record: consume CRLF or LF
      if (pos < len && content[pos] === "\r") pos++;
      if (pos < len && content[pos] === "\n") pos++;
      break;
    }

    // Skip empty trailing record caused by final newline
    if (record.length === 1 && record[0] === "" && pos >= len) break;

    records.push(record);
  }

  return records;
}

function getCell(rows: string[][], rowIdx: number, header: string, headers: string[]): string {
  const colIdx = headers.indexOf(header);
  if (colIdx === -1) throw new Error(`Header not found: ${header}`);
  return rows[rowIdx][colIdx] ?? "";
}

// ---------------------------------------------------------------------------
// UTF-8 BOM
// ---------------------------------------------------------------------------

describe("UTF-8 BOM", () => {
  it("prepends BOM to the output", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("content after BOM starts with the header row", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const content = csv.slice(1);
    // csv-stringify quotes fields; first header field is "ID" (with quotes) or ID (unquoted)
    expect(content.replace(/^"/, "")).toMatch(/^ID/);
  });
});

// ---------------------------------------------------------------------------
// Simple product
// ---------------------------------------------------------------------------

describe("simple product", () => {
  it("generates exactly two rows (header + data)", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
  });

  it("sets Type to 'simple'", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Type", rows[0])).toBe("simple");
  });

  it("sets SKU to parentSku", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "SKU", rows[0])).toBe("TROPHY-001");
  });

  it("sets Name", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Name", rows[0])).toBe("Gold Star Trophy");
  });

  it("sets Published to 1", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Published", rows[0])).toBe("1");
  });

  it("sets Is featured? to 0", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Is featured?", rows[0])).toBe("0");
  });

  it("sets Visibility to 'visible'", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Visibility in catalog", rows[0])).toBe("visible");
  });

  it("sets Short description from product", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Short description", rows[0])).toBe("A gleaming gold star trophy.");
  });

  it("sets Description from product", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Description", rows[0])).toContain("Gold star trophy");
  });

  it("sets Tax status to 'taxable'", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Tax status", rows[0])).toBe("taxable");
  });

  it("sets In stock? to 1", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "In stock?", rows[0])).toBe("1");
  });

  it("sets dimensions as whole numbers without units", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Weight (kg)", rows[0])).toBe("150");
    expect(getCell(rows, 1, "Width (cm)", rows[0])).toBe("80");
    expect(getCell(rows, 1, "Height (cm)", rows[0])).toBe("200");
  });

  it("sets Regular price from variation", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Regular price", rows[0])).toBe("25");
  });

  it("sets Categories with ' > ' separator", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Categories", rows[0])).toBe("Trophies > Football");
  });

  it("sets Images from variation", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Images", rows[0])).toBe(
      "https://example.com/img/trophy-gold.jpg",
    );
  });

  it("sets Parent to empty string", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Parent", rows[0])).toBe("");
  });

  it("sets ID to empty string", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "ID", rows[0])).toBe("");
  });

  it("leaves Length empty (no length on RawProduct)", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Length (cm)", rows[0])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Variable product
// ---------------------------------------------------------------------------

describe("variable product", () => {
  it("generates header + parent + one row per variation", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    // header + parent + 2 variations
    expect(rows).toHaveLength(4);
  });

  it("parent row has Type = 'variable'", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Type", rows[0])).toBe("variable");
  });

  it("variation rows have Type = 'variation'", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 2, "Type", rows[0])).toBe("variation");
    expect(getCell(rows, 3, "Type", rows[0])).toBe("variation");
  });

  it("parent row SKU equals parentSku", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "SKU", rows[0])).toBe("MEDAL-100");
  });

  it("variation rows have their own SKUs", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 2, "SKU", rows[0])).toBe("MEDAL-100-SILVER");
    expect(getCell(rows, 3, "SKU", rows[0])).toBe("MEDAL-100-GOLD");
  });

  it("variation rows have Parent set to parentSku", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 2, "Parent", rows[0])).toBe("MEDAL-100");
    expect(getCell(rows, 3, "Parent", rows[0])).toBe("MEDAL-100");
  });

  it("parent row has empty Parent field", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Parent", rows[0])).toBe("");
  });

  it("parent Name populated, variation Name empty", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Name", rows[0])).toBe("Swim Club Medal");
    expect(getCell(rows, 2, "Name", rows[0])).toBe("");
    expect(getCell(rows, 3, "Name", rows[0])).toBe("");
  });

  it("parent weight/dimensions empty, variation dimensions populated", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Weight (kg)", rows[0])).toBe("");
    expect(getCell(rows, 2, "Weight (kg)", rows[0])).toBe("50");
    expect(getCell(rows, 2, "Width (cm)", rows[0])).toBe("60");
    expect(getCell(rows, 2, "Height (cm)", rows[0])).toBe("60");
  });

  it("parent Regular price empty, variation has price", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Regular price", rows[0])).toBe("");
    expect(getCell(rows, 2, "Regular price", rows[0])).toBe("10");
    expect(getCell(rows, 3, "Regular price", rows[0])).toBe("12");
  });

  it("parent Categories populated, variation Categories empty", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Categories", rows[0])).toBe("Medals > Swimming");
    expect(getCell(rows, 2, "Categories", rows[0])).toBe("");
  });

  it("parent Images come from first variation's images", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    // first variation has 2 images
    expect(getCell(rows, 1, "Images", rows[0])).toBe(
      "https://example.com/img/medal-silver-1.jpg,https://example.com/img/medal-silver-2.jpg",
    );
  });

  it("variation Images come from that variation", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 2, "Images", rows[0])).toBe(
      "https://example.com/img/medal-silver-1.jpg,https://example.com/img/medal-silver-2.jpg",
    );
    expect(getCell(rows, 3, "Images", rows[0])).toBe(
      "https://example.com/img/medal-gold-1.jpg",
    );
  });

  it("parent Short description and Description populated, variation empty", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Short description", rows[0])).toBe("A prestigious swim club medal.");
    expect(getCell(rows, 2, "Short description", rows[0])).toBe("");
    expect(getCell(rows, 2, "Description", rows[0])).toBe("");
  });

  it("In stock? is '1' on both parent and variation rows", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    // parent row (index 1)
    expect(getCell(rows, 1, "In stock?", rows[0])).toBe("1");
    // first variation (index 2)
    expect(getCell(rows, 2, "In stock?", rows[0])).toBe("1");
    // second variation (index 3)
    expect(getCell(rows, 3, "In stock?", rows[0])).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// Attribute columns
// ---------------------------------------------------------------------------

describe("attribute columns", () => {
  it("generates correct header names for each attribute", () => {
    const config: CsvBuilderConfig = { attributes: [colourAttr, sizeAttr] };
    const csv = buildCsv([makeSimpleProduct({ attributeValues: { pa_colour: ["Gold"], pa_size: ["S"] } })], config);
    const rows = parseCsv(csv);
    const headers = rows[0];
    expect(headers).toContain("Attribute 1 name");
    expect(headers).toContain("Attribute 1 value(s)");
    expect(headers).toContain("Attribute 1 visible");
    expect(headers).toContain("Attribute 1 global");
    expect(headers).toContain("Attribute 2 name");
    expect(headers).toContain("Attribute 2 value(s)");
    expect(headers).toContain("Attribute 2 visible");
    expect(headers).toContain("Attribute 2 global");
  });

  it("simple product attribute name column has attribute name", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Attribute 1 name", rows[0])).toBe("Colour");
  });

  it("simple product attribute values from attributeValues", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Attribute 1 value(s)", rows[0])).toBe("Gold");
  });

  it("parent row attribute values contains all values comma-separated", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Attribute 1 value(s)", rows[0])).toBe("Silver, Gold");
  });

  it("variation row attribute value is the specific variation's value", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 2, "Attribute 1 value(s)", rows[0])).toBe("Silver");
    expect(getCell(rows, 3, "Attribute 1 value(s)", rows[0])).toBe("Gold");
  });

  it("attribute visible is 1 on all rows", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Attribute 1 visible", rows[0])).toBe("1");
    expect(getCell(rows, 2, "Attribute 1 visible", rows[0])).toBe("1");
  });

  it("attribute global is 1 when isGlobal=true", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Attribute 1 global", rows[0])).toBe("1");
  });

  it("attribute global is 0 when isGlobal=false", () => {
    const config: CsvBuilderConfig = {
      attributes: [{ ...colourAttr, isGlobal: false }],
    };
    const csv = buildCsv([makeSimpleProduct()], config);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Attribute 1 global", rows[0])).toBe("0");
  });

  it("variation row attribute name column is empty", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 2, "Attribute 1 name", rows[0])).toBe("");
  });

  it("no attribute columns generated when attributes array is empty", () => {
    const config: CsvBuilderConfig = { attributes: [] };
    const csv = buildCsv([makeSimpleProduct()], config);
    const rows = parseCsv(csv);
    const headers = rows[0];
    expect(headers.some((h) => h.startsWith("Attribute"))).toBe(false);
  });

  it("missing attribute slug returns empty string (simple product with no attributeValues)", () => {
    const product = makeSimpleProduct();
    // Remove the attribute from both variation and attributeValues
    product.variations[0].attributes = {};
    product.attributeValues = {};
    const csv = buildCsv([product], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Attribute 1 value(s)", rows[0])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// SEO columns
// ---------------------------------------------------------------------------

describe("SEO columns", () => {
  it("Yoast columns present in header by default", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    const headers = rows[0];
    expect(headers).toContain("Meta: _yoast_wpseo_title");
    expect(headers).toContain("Meta: _yoast_wpseo_metadesc");
  });

  it("Yoast meta title populated on simple product", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Meta: _yoast_wpseo_title", rows[0])).toBe(
      "Football Trophies Inner West | Gold Star Trophy",
    );
  });

  it("Yoast meta description populated on simple product", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Meta: _yoast_wpseo_metadesc", rows[0])).toContain(
      "Sydney NSW",
    );
  });

  it("SEO columns populated on variable parent, empty on variations", () => {
    const csv = buildCsv([makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Meta: _yoast_wpseo_title", rows[0])).toBe(
      "Swimming Medals Inner West | Swim Club Medal",
    );
    expect(getCell(rows, 2, "Meta: _yoast_wpseo_title", rows[0])).toBe("");
    expect(getCell(rows, 3, "Meta: _yoast_wpseo_title", rows[0])).toBe("");
  });

  it("RankMath columns used when seoPlugin = 'rankmath'", () => {
    const config: CsvBuilderConfig = { attributes: [], seoPlugin: "rankmath" };
    const csv = buildCsv([makeSimpleProduct()], config);
    const rows = parseCsv(csv);
    const headers = rows[0];
    expect(headers).toContain("Meta: rank_math_title");
    expect(headers).toContain("Meta: rank_math_description");
    expect(headers).not.toContain("Meta: _yoast_wpseo_title");
  });

  it("RankMath meta title populated", () => {
    const config: CsvBuilderConfig = { attributes: [], seoPlugin: "rankmath" };
    const csv = buildCsv([makeSimpleProduct()], config);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Meta: rank_math_title", rows[0])).toBe(
      "Football Trophies Inner West | Gold Star Trophy",
    );
  });
});

// ---------------------------------------------------------------------------
// Column headers (fixed)
// ---------------------------------------------------------------------------

describe("fixed column headers", () => {
  it("includes default weight and dimension units", () => {
    const csv = buildCsv([makeSimpleProduct()], baseConfig);
    const rows = parseCsv(csv);
    const headers = rows[0];
    expect(headers).toContain("Weight (kg)");
    expect(headers).toContain("Length (cm)");
    expect(headers).toContain("Width (cm)");
    expect(headers).toContain("Height (cm)");
  });

  it("uses custom weight and dimension units when specified", () => {
    const config: CsvBuilderConfig = {
      attributes: [],
      weightUnit: "g",
      dimensionUnit: "mm",
    };
    const csv = buildCsv([makeSimpleProduct()], config);
    const rows = parseCsv(csv);
    const headers = rows[0];
    expect(headers).toContain("Weight (g)");
    expect(headers).toContain("Width (mm)");
    expect(headers).toContain("Height (mm)");
    expect(headers).not.toContain("Weight (kg)");
  });

  it("header row appears exactly once as the first row", () => {
    const csv = buildCsv([makeSimpleProduct(), makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    // Only first row has "Type" literally as a value
    expect(rows[0][1]).toBe("Type");
    // Data rows have real types
    expect(rows[1][1]).toBe("simple");
    expect(rows[2][1]).toBe("variable");
  });
});

// ---------------------------------------------------------------------------
// Multiple products
// ---------------------------------------------------------------------------

describe("multiple products", () => {
  it("outputs products in the order provided", () => {
    const csv = buildCsv([makeSimpleProduct(), makeVariableProduct()], baseConfig);
    const rows = parseCsv(csv);
    // row 0 = header, row 1 = simple, row 2 = variable parent, rows 3-4 = variations
    expect(rows).toHaveLength(5); // 1 header + 1 simple + 1 parent + 2 variations
    expect(getCell(rows, 1, "SKU", rows[0])).toBe("TROPHY-001");
    expect(getCell(rows, 2, "SKU", rows[0])).toBe("MEDAL-100");
  });

  it("empty product list produces only a header row", () => {
    const csv = buildCsv([], baseConfig);
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("ID");
  });
});

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

describe("number formatting", () => {
  it("formats float dimensions as whole numbers", () => {
    const product = makeSimpleProduct();
    product.variations[0].dimensions = { weight: 150.7, width: 80.3, height: 200.0 };
    const csv = buildCsv([product], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Weight (kg)", rows[0])).toBe("151");
    expect(getCell(rows, 1, "Width (cm)", rows[0])).toBe("80");
    expect(getCell(rows, 1, "Height (cm)", rows[0])).toBe("200");
  });

  it("formats price as a whole number", () => {
    const product = makeSimpleProduct();
    product.variations[0].price = 25.99;
    const csv = buildCsv([product], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Regular price", rows[0])).toBe("26");
  });

  it("leaves dimension fields empty when no dimensions on variation", () => {
    const product = makeSimpleProduct();
    product.variations[0].dimensions = undefined;
    const csv = buildCsv([product], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Weight (kg)", rows[0])).toBe("");
    expect(getCell(rows, 1, "Width (cm)", rows[0])).toBe("");
    expect(getCell(rows, 1, "Height (cm)", rows[0])).toBe("");
  });

  it("leaves price empty when variation has no price", () => {
    const product = makeSimpleProduct();
    product.variations[0].price = undefined;
    const csv = buildCsv([product], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Regular price", rows[0])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

describe("categories formatting", () => {
  it("single category has no separator", () => {
    const product = makeSimpleProduct({ categoryPath: ["Trophies"] });
    const csv = buildCsv([product], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Categories", rows[0])).toBe("Trophies");
  });

  it("three-level hierarchy formatted correctly", () => {
    const product = makeSimpleProduct({
      categoryPath: ["Awards", "Sports", "Football"],
    });
    const csv = buildCsv([product], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Categories", rows[0])).toBe("Awards > Sports > Football");
  });

  it("empty categoryPath gives empty Categories cell", () => {
    const product = makeSimpleProduct({ categoryPath: [] });
    const csv = buildCsv([product], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Categories", rows[0])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

describe("images formatting", () => {
  it("multiple images are comma-separated", () => {
    const product = makeSimpleProduct();
    product.variations[0].images = [
      "https://example.com/a.jpg",
      "https://example.com/b.jpg",
      "https://example.com/c.jpg",
    ];
    const csv = buildCsv([product], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Images", rows[0])).toBe(
      "https://example.com/a.jpg,https://example.com/b.jpg,https://example.com/c.jpg",
    );
  });

  it("empty images array gives empty Images cell", () => {
    const product = makeSimpleProduct();
    product.variations[0].images = [];
    const csv = buildCsv([product], baseConfig);
    const rows = parseCsv(csv);
    expect(getCell(rows, 1, "Images", rows[0])).toBe("");
  });
});
