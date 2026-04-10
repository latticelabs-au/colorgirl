import { describe, it, expect } from "vitest";
import {
  stripPrefix,
  reorderColours,
  replaceSlashes,
  formatNumber,
  assignSizeLabels,
  formatDimensions,
  applyTransform,
  stripUnits,
} from "../transforms.js";

// ---------------------------------------------------------------------------
// stripPrefix
// ---------------------------------------------------------------------------

describe("stripPrefix", () => {
  it("strips a prefix that is present", () => {
    expect(stripPrefix("Antique Silver", "Antique")).toBe("Silver");
  });

  it("strips a prefix and trims leading whitespace", () => {
    expect(stripPrefix("Antique Gold", "Antique")).toBe("Gold");
  });

  it("returns the value unchanged when prefix is absent", () => {
    expect(stripPrefix("Silver", "Antique")).toBe("Silver");
  });

  it("returns the value unchanged when prefix does not match", () => {
    expect(stripPrefix("Matte Gold", "Antique")).toBe("Matte Gold");
  });

  it("handles empty string value", () => {
    expect(stripPrefix("", "Antique")).toBe("");
  });

  it("handles empty string prefix (no-op)", () => {
    expect(stripPrefix("Antique Silver", "")).toBe("Antique Silver");
  });

  it("strips a custom prefix", () => {
    expect(stripPrefix("Matte Blue", "Matte")).toBe("Blue");
  });

  it("does not strip prefix that matches only a substring (not at start)", () => {
    expect(stripPrefix("Royal Antique", "Antique")).toBe("Royal Antique");
  });
});

// ---------------------------------------------------------------------------
// reorderColours
// ---------------------------------------------------------------------------

describe("reorderColours", () => {
  it("moves Silver to the end", () => {
    expect(reorderColours("Silver / Pink")).toBe("Pink / Silver");
  });

  it("moves Gold to the end", () => {
    expect(reorderColours("Gold / Blue")).toBe("Blue / Gold");
  });

  it("moves both Silver and Gold to the end, preserving their relative order", () => {
    expect(reorderColours("Gold / Blue / Silver")).toBe("Blue / Gold / Silver");
  });

  it("keeps Silver and Gold at end when already last", () => {
    expect(reorderColours("Pink / Blue / Silver")).toBe("Pink / Blue / Silver");
  });

  it("does not reorder when no Silver or Gold present", () => {
    expect(reorderColours("Pink / Blue")).toBe("Pink / Blue");
  });

  it("handles single colour with no slash", () => {
    expect(reorderColours("Silver")).toBe("Silver");
  });

  it("handles Silver and Gold together at start", () => {
    expect(reorderColours("Silver / Gold / Red")).toBe("Red / Silver / Gold");
  });

  it("handles Gold and Silver together at start", () => {
    expect(reorderColours("Gold / Silver / Red")).toBe("Red / Gold / Silver");
  });

  it("does nothing with a single non-special colour", () => {
    expect(reorderColours("Pink")).toBe("Pink");
  });

  it("is case-insensitive for silver and gold detection", () => {
    expect(reorderColours("silver / Pink")).toBe("Pink / silver");
  });
});

// ---------------------------------------------------------------------------
// replaceSlashes
// ---------------------------------------------------------------------------

describe("replaceSlashes", () => {
  it("replaces a single slash pair", () => {
    expect(replaceSlashes("Plastic / Marble")).toBe("Plastic & Marble");
  });

  it("replaces multiple slash pairs", () => {
    expect(replaceSlashes("Gold / Silver / Bronze")).toBe(
      "Gold & Silver & Bronze"
    );
  });

  it("returns string unchanged when no slashes present", () => {
    expect(replaceSlashes("Plastic Marble")).toBe("Plastic Marble");
  });

  it("handles empty string", () => {
    expect(replaceSlashes("")).toBe("");
  });

  it("does not replace slashes without surrounding spaces", () => {
    // Only ' / ' (with spaces) should be replaced
    expect(replaceSlashes("Plastic/Marble")).toBe("Plastic/Marble");
  });
});

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------

describe("formatNumber", () => {
  it("strips trailing .0 from string input", () => {
    expect(formatNumber("100.00")).toBe("100");
  });

  it("strips unit suffix mm", () => {
    expect(formatNumber("150mm")).toBe("150");
  });

  it("strips trailing .0 from numeric input", () => {
    expect(formatNumber(100.0)).toBe("100");
  });

  it("rounds a decimal to the nearest whole number", () => {
    expect(formatNumber("75.5")).toBe("76");
  });

  it("rounds down correctly", () => {
    expect(formatNumber("75.4")).toBe("75");
  });

  it("strips unit suffix g with space", () => {
    expect(formatNumber("200 g")).toBe("200");
  });

  it("returns empty string for empty string input", () => {
    expect(formatNumber("")).toBe("");
  });

  it("returns empty string for non-numeric string", () => {
    expect(formatNumber("N/A")).toBe("");
  });

  it("handles integer string with no decimals", () => {
    expect(formatNumber("42")).toBe("42");
  });

  it("handles numeric 0", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("handles string with whitespace around number", () => {
    expect(formatNumber("  50  ")).toBe("50");
  });

  it("handles unit with no space between number and unit", () => {
    expect(formatNumber("300g")).toBe("300");
  });
});

// ---------------------------------------------------------------------------
// assignSizeLabels
// ---------------------------------------------------------------------------

describe("assignSizeLabels", () => {
  it("returns [] for 0 variants", () => {
    expect(assignSizeLabels(0)).toEqual([]);
  });

  it("returns [] for negative variant count", () => {
    expect(assignSizeLabels(-1)).toEqual([]);
  });

  it("returns [] for 1 variant (no size labelling needed)", () => {
    expect(assignSizeLabels(1)).toEqual([]);
  });

  it("returns S and L for 2 variants", () => {
    expect(assignSizeLabels(2)).toEqual(["S", "L"]);
  });

  it("returns S M L for 3 variants", () => {
    expect(assignSizeLabels(3)).toEqual(["S", "M", "L"]);
  });

  it("returns S M L XL for 4 variants", () => {
    expect(assignSizeLabels(4)).toEqual(["S", "M", "L", "XL"]);
  });

  it("introduces XS for 5 variants", () => {
    expect(assignSizeLabels(5)).toEqual(["XS", "S", "M", "L", "XL"]);
  });

  it("returns XS S M L XL XXL for 6 variants", () => {
    expect(assignSizeLabels(6)).toEqual(["XS", "S", "M", "L", "XL", "XXL"]);
  });

  it("returns XXS XS S M L XL XXL for 7 variants", () => {
    expect(assignSizeLabels(7)).toEqual([
      "XXS",
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "XXL",
    ]);
  });

  it("returns XXS XS S M L XL XXL XXXL for 8 variants", () => {
    expect(assignSizeLabels(8)).toEqual([
      "XXS",
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "XXL",
      "XXXL",
    ]);
  });

  it("returns all 8 sizes for variant count greater than 8", () => {
    // Capped at 8 (the full sequence)
    expect(assignSizeLabels(9)).toEqual([
      "XXS",
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "XXL",
      "XXXL",
    ]);
  });
});

// ---------------------------------------------------------------------------
// formatDimensions
// ---------------------------------------------------------------------------

describe("formatDimensions", () => {
  it("returns empty string for empty array", () => {
    expect(formatDimensions([])).toBe("");
  });

  it("returns just the value for a single entry", () => {
    expect(formatDimensions([{ label: "S", value: "52 x 19 mm" }])).toBe(
      "52 x 19 mm"
    );
  });

  it("formats multiple distinct entries with label prefixes", () => {
    expect(
      formatDimensions([
        { label: "S", value: "52 x 19 mm" },
        { label: "L", value: "52 x 28 mm" },
      ])
    ).toBe("S: 52 x 19 mm | L: 52 x 28 mm");
  });

  it("collapses consecutive labels with the same value into a range", () => {
    expect(
      formatDimensions([
        { label: "S", value: "52 x 19 mm" },
        { label: "M", value: "52 x 19 mm" },
        { label: "L", value: "52 x 19 mm" },
        { label: "XL", value: "52 x 28 mm" },
      ])
    ).toBe("S - L: 52 x 19 mm | XL: 52 x 28 mm");
  });

  it("returns just the value when all entries share the same value", () => {
    expect(
      formatDimensions([
        { label: "S", value: "52 x 19 mm" },
        { label: "M", value: "52 x 19 mm" },
        { label: "L", value: "52 x 19 mm" },
      ])
    ).toBe("52 x 19 mm");
  });

  it("handles two entries with the same value", () => {
    expect(
      formatDimensions([
        { label: "S", value: "52 x 19 mm" },
        { label: "M", value: "52 x 19 mm" },
      ])
    ).toBe("52 x 19 mm");
  });

  it("handles alternating distinct values (no collapsing possible)", () => {
    expect(
      formatDimensions([
        { label: "S", value: "52 x 19 mm" },
        { label: "M", value: "52 x 28 mm" },
        { label: "L", value: "52 x 19 mm" },
      ])
    ).toBe("S: 52 x 19 mm | M: 52 x 28 mm | L: 52 x 19 mm");
  });

  it("collapses trailing range correctly", () => {
    expect(
      formatDimensions([
        { label: "S", value: "52 x 19 mm" },
        { label: "M", value: "52 x 28 mm" },
        { label: "L", value: "52 x 28 mm" },
        { label: "XL", value: "52 x 28 mm" },
      ])
    ).toBe("S: 52 x 19 mm | M - XL: 52 x 28 mm");
  });
});

// ---------------------------------------------------------------------------
// applyTransform
// ---------------------------------------------------------------------------

describe("applyTransform", () => {
  it("dispatches strip_prefix (strips Antique)", () => {
    expect(applyTransform("Antique Silver", "strip_prefix")).toBe("Silver");
  });

  it("dispatches reorder_colours", () => {
    expect(applyTransform("Silver / Pink", "reorder_colours")).toBe(
      "Pink / Silver"
    );
  });

  it("dispatches replace_slashes", () => {
    expect(applyTransform("Plastic / Marble", "replace_slashes")).toBe(
      "Plastic & Marble"
    );
  });

  it("dispatches format_number", () => {
    expect(applyTransform("100.00", "format_number")).toBe("100");
  });

  it("returns value unchanged for unknown transform name", () => {
    expect(applyTransform("some value", "nonexistent_transform")).toBe(
      "some value"
    );
  });

  it("returns value unchanged for empty transform name", () => {
    expect(applyTransform("some value", "")).toBe("some value");
  });

  it("strip_prefix does not mutate non-Antique values", () => {
    expect(applyTransform("Silver", "strip_prefix")).toBe("Silver");
  });

  it("dispatches strip_units", () => {
    expect(applyTransform("150mm", "strip_units")).toBe("150");
  });
});

// ---------------------------------------------------------------------------
// stripUnits
// ---------------------------------------------------------------------------

describe("stripUnits", () => {
  it("strips trailing mm", () => {
    expect(stripUnits("75mm")).toBe("75");
  });

  it("strips trailing g", () => {
    expect(stripUnits("310g")).toBe("310");
  });

  it("strips trailing unit with space", () => {
    expect(stripUnits("100 g")).toBe("100");
  });

  it("strips trailing cm", () => {
    expect(stripUnits("15cm")).toBe("15");
  });

  it("returns empty string for empty input", () => {
    expect(stripUnits("")).toBe("");
  });

  it("returns value unchanged when no trailing unit", () => {
    expect(stripUnits("42")).toBe("42");
  });

  it("trims surrounding whitespace", () => {
    expect(stripUnits("  200mm  ")).toBe("200");
  });
});
