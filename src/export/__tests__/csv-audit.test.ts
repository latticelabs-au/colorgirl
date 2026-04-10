import { describe, it, expect } from "vitest";
import { auditCsv, AuditResult } from "../csv-audit.js";
import { buildCsv } from "../csv-builder.js";
import type { EnrichedProduct, RawProduct, AttributeDef } from "../../pipeline/models.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVariation(overrides: Partial<RawProduct> & { sku: string }): RawProduct {
  return {
    name: "Test Product",
    sourceUrl: "https://example.com",
    categoryPath: ["Trophies"],
    attributes: { pa_colour: "Gold" },
    images: ["https://example.com/img.jpg"],
    scrapedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeEnriched(overrides?: Partial<EnrichedProduct>): EnrichedProduct {
  return {
    parentSku: "TST-001",
    name: "Test Trophy",
    type: "variable",
    categoryPath: ["Trophies", "Dance"],
    variations: [
      makeVariation({ sku: "TST-001-G", attributes: { pa_colour: "Gold" } }),
      makeVariation({ sku: "TST-001-S", attributes: { pa_colour: "Silver" } }),
    ],
    attributeValues: { pa_colour: ["Gold", "Silver"] },
    shortDescription: "A test trophy.",
    longDescription: "A longer description of the trophy.",
    metaTitle: "Test Trophy | Trophies",
    metaDescription: "A great trophy for testing.",
    permalink: "test-trophy-trophies",
    keywords: "trophies, dance",
    ...overrides,
  };
}

const defaultAttrs: AttributeDef[] = [
  { name: "Colour", slug: "pa_colour", isVariation: true, isGlobal: true },
];

const defaultConfig = { attributes: defaultAttrs };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auditCsv", () => {
  it("returns no errors for a valid CSV", () => {
    const csv = buildCsv([makeEnriched()], defaultConfig);
    const result = auditCsv(csv);
    expect(result.errors).toHaveLength(0);
  });

  it("detects inconsistent column count", () => {
    const csv = buildCsv([makeEnriched()], defaultConfig);
    const lines = csv.split("\n");
    const fields = lines[1].split(",");
    fields.pop();
    lines[1] = fields.join(",");
    const broken = lines.join("\n");

    const result = auditCsv(broken);
    expect(result.errors.some((e) => e.message.includes("column count"))).toBe(true);
  });

  it("detects duplicate SKUs", () => {
    const product = makeEnriched({
      variations: [
        makeVariation({ sku: "DUP-001", attributes: { pa_colour: "Gold" } }),
        makeVariation({ sku: "DUP-001", attributes: { pa_colour: "Silver" } }),
      ],
    });
    const csv = buildCsv([product], defaultConfig);
    const result = auditCsv(csv);
    expect(result.errors.some((e) => e.message.includes("Duplicate SKU"))).toBe(true);
  });

  it("detects orphan variations (parent SKU missing)", () => {
    const csv = buildCsv([makeEnriched()], defaultConfig);
    const lines = csv.split("\n");
    lines.splice(1, 1);
    const broken = lines.join("\n");

    const result = auditCsv(broken);
    expect(result.errors.some((e) => e.message.includes("orphan"))).toBe(true);
  });

  it("detects variable product with no variations", () => {
    const csv = buildCsv([makeEnriched()], defaultConfig);
    const lines = csv.split("\n");
    const kept = lines.slice(0, 2);
    if (lines[lines.length - 1] === "") kept.push("");
    const broken = kept.join("\n");

    const result = auditCsv(broken);
    expect(
      result.errors.some((e) => e.message.includes("no variation"))
    ).toBe(true);
  });

  it("detects empty SKU", () => {
    const csv = buildCsv([makeEnriched()], defaultConfig);
    const lines = csv.split("\n");
    const row = lines[1];
    lines[1] = row.replace(/"TST-001"/, '""');
    const broken = lines.join("\n");

    const result = auditCsv(broken);
    expect(result.errors.some((e) => e.message.includes("empty SKU"))).toBe(true);
  });

  it("returns no errors for a simple product CSV", () => {
    const simple = makeEnriched({
      type: "simple",
      variations: [
        makeVariation({ sku: "SIM-001", attributes: { pa_colour: "Gold" } }),
      ],
      attributeValues: { pa_colour: ["Gold"] },
    });
    const csv = buildCsv([simple], defaultConfig);
    const result = auditCsv(csv);
    expect(result.errors).toHaveLength(0);
  });

  it("returns no errors for header-only CSV (no products)", () => {
    const csv = buildCsv([], defaultConfig);
    const result = auditCsv(csv);
    expect(result.errors).toHaveLength(0);
  });
});
