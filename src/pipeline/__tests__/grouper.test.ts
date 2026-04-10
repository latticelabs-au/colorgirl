import { describe, it, expect } from "vitest";
import { deriveBaseName, groupProducts, GrouperConfig } from "../grouper.js";
import { RawProduct, AttributeDef } from "../models.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProduct(overrides: Partial<RawProduct> & { sku: string; name: string }): RawProduct {
  return {
    sourceUrl: "https://example.com/product",
    categoryPath: ["Trophies", "Dance"],
    attributes: {},
    images: [],
    scrapedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// deriveBaseName
// ---------------------------------------------------------------------------

describe("deriveBaseName", () => {
  it("strips a trailing known colour (Gold)", () => {
    expect(deriveBaseName("Jetstream Dance Trophy Gold")).toBe(
      "Jetstream Dance Trophy"
    );
  });

  it("strips a trailing size token (150mm)", () => {
    expect(deriveBaseName("Jetstream Dance Trophy 150mm")).toBe(
      "Jetstream Dance Trophy"
    );
  });

  it("strips both trailing colour and size", () => {
    expect(deriveBaseName("Jetstream Dance Trophy Gold 150mm")).toBe(
      "Jetstream Dance Trophy"
    );
  });

  it("strips Silver", () => {
    expect(deriveBaseName("Star Medal Silver")).toBe("Star Medal");
  });

  it("strips Bronze", () => {
    expect(deriveBaseName("Star Medal Bronze")).toBe("Star Medal");
  });

  it("strips Blue", () => {
    expect(deriveBaseName("Ribbon Award Blue")).toBe("Ribbon Award");
  });

  it("strips Red", () => {
    expect(deriveBaseName("Ribbon Award Red")).toBe("Ribbon Award");
  });

  it("strips Pink", () => {
    expect(deriveBaseName("Ribbon Award Pink")).toBe("Ribbon Award");
  });

  it("strips Green", () => {
    expect(deriveBaseName("Ribbon Award Green")).toBe("Ribbon Award");
  });

  it("strips White", () => {
    expect(deriveBaseName("Ribbon Award White")).toBe("Ribbon Award");
  });

  it("strips Black", () => {
    expect(deriveBaseName("Ribbon Award Black")).toBe("Ribbon Award");
  });

  it("strips bare digit size token", () => {
    expect(deriveBaseName("Trophy 150")).toBe("Trophy");
  });

  it("strips size with cm unit", () => {
    expect(deriveBaseName("Trophy 15cm")).toBe("Trophy");
  });

  it("strips size with inch unit", () => {
    expect(deriveBaseName("Trophy 6inch")).toBe("Trophy");
  });

  it("strips size with inches unit", () => {
    expect(deriveBaseName("Trophy 6inches")).toBe("Trophy");
  });

  it("strips size with quote unit", () => {
    expect(deriveBaseName('Trophy 6"')).toBe("Trophy");
  });

  it("strips multiple trailing tokens iteratively", () => {
    // Gold then 150mm, but also works if size comes before colour
    expect(deriveBaseName("Jetstream Dance Trophy Gold 150mm")).toBe(
      "Jetstream Dance Trophy"
    );
    expect(deriveBaseName("Jetstream Dance Trophy 150mm Gold")).toBe(
      "Jetstream Dance Trophy"
    );
  });

  it("returns the name unchanged when nothing to strip", () => {
    expect(deriveBaseName("Achievement Award")).toBe("Achievement Award");
  });

  it("does not strip a mid-word false positive (Golden contains Gold but is not Gold)", () => {
    expect(deriveBaseName("Golden Achievement Trophy")).toBe(
      "Golden Achievement Trophy"
    );
  });

  it("does not strip Silverware (contains Silver but is not Silver)", () => {
    expect(deriveBaseName("Silverware Award")).toBe("Silverware Award");
  });

  it("is case-insensitive for colour tokens", () => {
    expect(deriveBaseName("Star Medal SILVER")).toBe("Star Medal");
    expect(deriveBaseName("Star Medal gold")).toBe("Star Medal");
  });

  it("handles a name that is only a colour (returns empty string)", () => {
    expect(deriveBaseName("Gold")).toBe("");
  });

  it("handles empty string input", () => {
    expect(deriveBaseName("")).toBe("");
  });

  it("handles extra whitespace between words (internal whitespace is normalised)", () => {
    // deriveBaseName splits on /\s+/ and rejoins with single spaces, so
    // leading/trailing and multiple internal spaces are all collapsed.
    expect(deriveBaseName("  Star  Medal  Silver  ")).toBe("Star Medal");
  });
});

// ---------------------------------------------------------------------------
// groupProducts — basic grouping
// ---------------------------------------------------------------------------

describe("groupProducts — basic grouping", () => {
  it("returns an empty array when given no products", () => {
    expect(groupProducts([])).toEqual([]);
  });

  it("groups two products with the same base name and category into one GroupedProduct", () => {
    const products = [
      makeProduct({ sku: "TRP-001-G", name: "Jetstream Dance Trophy Gold" }),
      makeProduct({ sku: "TRP-001-S", name: "Jetstream Dance Trophy Silver" }),
    ];
    const result = groupProducts(products);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Jetstream Dance Trophy");
    expect(result[0].variations).toHaveLength(2);
  });

  it("keeps products with different base names in separate groups", () => {
    const products = [
      makeProduct({ sku: "TRP-001", name: "Alpha Trophy Gold" }),
      makeProduct({ sku: "TRP-002", name: "Beta Trophy Gold" }),
    ];
    const result = groupProducts(products);
    expect(result).toHaveLength(2);
  });

  it("keeps products with the same base name but different categories in separate groups", () => {
    const products = [
      makeProduct({
        sku: "TRP-001",
        name: "Star Medal Gold",
        categoryPath: ["Medals", "Dance"],
      }),
      makeProduct({
        sku: "TRP-002",
        name: "Star Medal Gold",
        categoryPath: ["Medals", "Sports"],
      }),
    ];
    const result = groupProducts(products);
    expect(result).toHaveLength(2);
  });

  it("produces a single-variation group for a product with no siblings", () => {
    const products = [
      makeProduct({ sku: "TRP-001", name: "Unique Trophy" }),
    ];
    const result = groupProducts(products);
    expect(result).toHaveLength(1);
    expect(result[0].variations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// groupProducts — type determination
// ---------------------------------------------------------------------------

describe("groupProducts — type determination", () => {
  it("sets type to 'simple' when there is exactly one product in the group", () => {
    const products = [makeProduct({ sku: "A-001", name: "Solo Trophy" })];
    const result = groupProducts(products);
    expect(result[0].type).toBe("simple");
  });

  it("sets type to 'variable' when there are two or more products in the group", () => {
    const products = [
      makeProduct({ sku: "A-001-G", name: "Combo Trophy Gold" }),
      makeProduct({ sku: "A-001-S", name: "Combo Trophy Silver" }),
    ];
    const result = groupProducts(products);
    expect(result[0].type).toBe("variable");
  });

  it("sets type to 'simple' after SKU deduplication leaves only one product", () => {
    const products = [
      makeProduct({ sku: "DUP-001", name: "Trophy Gold" }),
      makeProduct({ sku: "DUP-001", name: "Trophy Gold" }), // duplicate SKU
    ];
    const result = groupProducts(products);
    expect(result[0].type).toBe("simple");
    expect(result[0].variations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// groupProducts — SKU deduplication
// ---------------------------------------------------------------------------

describe("groupProducts — SKU deduplication", () => {
  it("keeps only the first product when two share the same SKU", () => {
    const p1 = makeProduct({ sku: "X-001", name: "Trophy Gold", price: 10 });
    const p2 = makeProduct({ sku: "X-001", name: "Trophy Gold", price: 99 });
    const result = groupProducts([p1, p2]);
    expect(result[0].variations).toHaveLength(1);
    expect(result[0].variations[0].price).toBe(10);
  });

  it("does not deduplicate products with different SKUs", () => {
    const products = [
      makeProduct({ sku: "X-001", name: "Trophy Gold" }),
      makeProduct({ sku: "X-002", name: "Trophy Silver" }),
    ];
    const result = groupProducts(products);
    expect(result[0].variations).toHaveLength(2);
  });

  it("deduplicates across three products: keeps first, drops later duplicates", () => {
    const products = [
      makeProduct({ sku: "X-001", name: "Trophy Gold", price: 1 }),
      makeProduct({ sku: "X-001", name: "Trophy Gold", price: 2 }),
      makeProduct({ sku: "X-001", name: "Trophy Gold", price: 3 }),
    ];
    const result = groupProducts(products);
    expect(result[0].variations).toHaveLength(1);
    expect(result[0].variations[0].price).toBe(1);
  });

  it("only deduplicates within the same group, not across groups", () => {
    // SKU X-001 appears in two groups (different categories)
    const products = [
      makeProduct({ sku: "X-001", name: "Trophy Gold", categoryPath: ["A"] }),
      makeProduct({ sku: "X-001", name: "Trophy Gold", categoryPath: ["B"] }),
    ];
    const result = groupProducts(products);
    expect(result).toHaveLength(2);
    expect(result[0].variations).toHaveLength(1);
    expect(result[1].variations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// groupProducts — parentSku selection
// ---------------------------------------------------------------------------

describe("groupProducts — parentSku selection", () => {
  it("selects the lexicographically lowest SKU as parentSku", () => {
    const products = [
      makeProduct({ sku: "TRP-003", name: "Trophy Gold" }),
      makeProduct({ sku: "TRP-001", name: "Trophy Silver" }),
      makeProduct({ sku: "TRP-002", name: "Trophy Bronze" }),
    ];
    const result = groupProducts(products);
    expect(result[0].parentSku).toBe("TRP-001");
  });

  it("parentSku equals the only SKU for a simple product", () => {
    const products = [makeProduct({ sku: "Z-999", name: "Solo Trophy" })];
    const result = groupProducts(products);
    expect(result[0].parentSku).toBe("Z-999");
  });

  it("handles lexicographic ordering correctly (not numeric)", () => {
    // Lexicographic: "TRP-10" < "TRP-9" because "1" < "9"
    const products = [
      makeProduct({ sku: "TRP-9", name: "Trophy Gold" }),
      makeProduct({ sku: "TRP-10", name: "Trophy Silver" }),
    ];
    const result = groupProducts(products);
    expect(result[0].parentSku).toBe("TRP-10");
  });
});

// ---------------------------------------------------------------------------
// groupProducts — attributeValues collection
// ---------------------------------------------------------------------------

describe("groupProducts — attributeValues", () => {
  it("collects distinct values for a single attribute key", () => {
    const products = [
      makeProduct({
        sku: "A-001",
        name: "Trophy Gold",
        attributes: { pa_colour: "Gold" },
      }),
      makeProduct({
        sku: "A-002",
        name: "Trophy Silver",
        attributes: { pa_colour: "Silver" },
      }),
    ];
    const result = groupProducts(products);
    expect(result[0].attributeValues["pa_colour"]).toEqual(["Gold", "Silver"]);
  });

  it("deduplicates repeated attribute values", () => {
    const products = [
      makeProduct({ sku: "A-001", name: "Trophy Gold", attributes: { pa_colour: "Gold" } }),
      makeProduct({ sku: "A-002", name: "Trophy Silver", attributes: { pa_colour: "Silver" } }),
      makeProduct({ sku: "A-003", name: "Trophy Bronze", attributes: { pa_colour: "Gold" } }),
    ];
    const result = groupProducts(products);
    // Gold appears twice but should only be listed once
    expect(result[0].attributeValues["pa_colour"]).toEqual(["Gold", "Silver"]);
  });

  it("collects values for multiple attribute keys", () => {
    const products = [
      makeProduct({
        sku: "A-001",
        name: "Trophy Gold",
        attributes: { pa_colour: "Gold", pa_size: "150mm" },
      }),
      makeProduct({
        sku: "A-002",
        name: "Trophy Silver",
        attributes: { pa_colour: "Silver", pa_size: "200mm" },
      }),
    ];
    const result = groupProducts(products);
    expect(result[0].attributeValues["pa_colour"]).toEqual(["Gold", "Silver"]);
    expect(result[0].attributeValues["pa_size"]).toEqual(["150mm", "200mm"]);
  });

  it("ignores empty attribute values", () => {
    const products = [
      makeProduct({ sku: "A-001", name: "Trophy Gold", attributes: { pa_colour: "Gold", pa_size: "" } }),
      makeProduct({ sku: "A-002", name: "Trophy Silver", attributes: { pa_colour: "Silver", pa_size: "" } }),
    ];
    const result = groupProducts(products);
    expect(result[0].attributeValues["pa_size"]).toBeUndefined();
  });

  it("returns empty attributeValues object when variations have no attributes", () => {
    const products = [
      makeProduct({ sku: "A-001", name: "Trophy" }),
    ];
    const result = groupProducts(products);
    expect(result[0].attributeValues).toEqual({});
  });

  it("preserves insertion order of values (first-seen ordering)", () => {
    const products = [
      makeProduct({ sku: "A-003", name: "Trophy Bronze", attributes: { pa_colour: "Bronze" } }),
      makeProduct({ sku: "A-001", name: "Trophy Gold", attributes: { pa_colour: "Gold" } }),
      makeProduct({ sku: "A-002", name: "Trophy Silver", attributes: { pa_colour: "Silver" } }),
    ];
    const result = groupProducts(products);
    // Order matches the order they appear in the input bucket
    expect(result[0].attributeValues["pa_colour"]).toEqual(["Bronze", "Gold", "Silver"]);
  });
});

// ---------------------------------------------------------------------------
// groupProducts — attribute transforms
// ---------------------------------------------------------------------------

describe("groupProducts — attribute transforms", () => {
  const colourAttr: AttributeDef = {
    name: "Colour",
    slug: "pa_colour",
    isVariation: true,
    isGlobal: true,
    transform: "strip_prefix",
  };

  it("applies a named transform to matching attribute values", () => {
    const products = [
      makeProduct({ sku: "A-001", name: "Trophy Gold", attributes: { pa_colour: "Antique Gold" } }),
      makeProduct({ sku: "A-002", name: "Trophy Silver", attributes: { pa_colour: "Antique Silver" } }),
    ];
    const result = groupProducts(products, { attributes: [colourAttr] });
    expect(result[0].attributeValues["pa_colour"]).toEqual(["Gold", "Silver"]);
  });

  it("does not transform attributes that are not in the config", () => {
    const products = [
      makeProduct({
        sku: "A-001",
        name: "Trophy Gold",
        attributes: { pa_colour: "Antique Gold", pa_size: "150mm" },
      }),
    ];
    const result = groupProducts(products, { attributes: [colourAttr] });
    // pa_size has no transform defined, should be left as-is
    expect(result[0].attributeValues["pa_size"]).toEqual(["150mm"]);
  });

  it("applies colour_cleanup transform (reorder then replace slashes)", () => {
    const attrDef: AttributeDef = {
      name: "Colour",
      slug: "pa_colour",
      isVariation: true,
      isGlobal: true,
      transform: "colour_cleanup",
    };
    const products = [
      makeProduct({
        sku: "A-001",
        name: "Trophy Dual Colour",
        attributes: { pa_colour: "Silver / Pink" },
      }),
    ];
    const result = groupProducts(products, { attributes: [attrDef] });
    // reorderColours: Silver/Pink → Pink/Silver; replaceSlashes: Pink/Silver → Pink & Silver
    expect(result[0].attributeValues["pa_colour"]).toEqual(["Pink & Silver"]);
  });

  it("does not mutate the original RawProduct attribute values", () => {
    const original = makeProduct({
      sku: "A-001",
      name: "Trophy Gold",
      attributes: { pa_colour: "Antique Gold" },
    });
    groupProducts([original], { attributes: [colourAttr] });
    expect(original.attributes["pa_colour"]).toBe("Antique Gold");
  });

  it("skips attribute transform when attribute is absent on a variation", () => {
    const products = [
      makeProduct({ sku: "A-001", name: "Trophy Gold", attributes: { pa_size: "150mm" } }),
    ];
    // pa_colour transform defined but pa_colour is absent — no crash
    const result = groupProducts(products, { attributes: [colourAttr] });
    expect(result[0].attributeValues["pa_size"]).toEqual(["150mm"]);
    expect(result[0].attributeValues["pa_colour"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// groupProducts — custom groupKey
// ---------------------------------------------------------------------------

describe("groupProducts — custom groupKey", () => {
  it("uses the custom groupKey function when provided", () => {
    const products = [
      makeProduct({ sku: "A-001", name: "Alpha Trophy Gold", categoryPath: ["Cat1"] }),
      // Same custom key but different derived base name — should still group together
      makeProduct({ sku: "A-002", name: "Alpha Trophy Silver", categoryPath: ["Cat1"] }),
      makeProduct({ sku: "B-001", name: "Beta Trophy Gold", categoryPath: ["Cat1"] }),
    ];

    const config: GrouperConfig = {
      // Group everything in Cat1 that starts with "Alpha" together
      groupKey: (p) => (p.name.startsWith("Alpha") ? "alpha-group" : "beta-group"),
    };

    const result = groupProducts(products, config);
    expect(result).toHaveLength(2);

    const alphaGroup = result.find((g) => g.parentSku === "A-001");
    expect(alphaGroup).toBeDefined();
    expect(alphaGroup!.variations).toHaveLength(2);
  });

  it("custom groupKey overrides the default base-name derivation", () => {
    const products = [
      // These would normally be in two groups (different base names)
      makeProduct({ sku: "X-001", name: "Rocket Trophy Gold" }),
      makeProduct({ sku: "X-002", name: "Star Medal Silver" }),
    ];

    const config: GrouperConfig = {
      groupKey: () => "forced-single-group",
    };

    const result = groupProducts(products, config);
    expect(result).toHaveLength(1);
    expect(result[0].variations).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// groupProducts — output ordering and categoryPath
// ---------------------------------------------------------------------------

describe("groupProducts — output ordering and metadata", () => {
  it("sorts the output array by parentSku ascending", () => {
    const products = [
      makeProduct({ sku: "C-001", name: "Trophy Gold" }),
      makeProduct({ sku: "A-001", name: "Alpha Trophy Gold" }),
      makeProduct({ sku: "B-001", name: "Beta Trophy Gold" }),
    ];
    const result = groupProducts(products);
    const skus = result.map((g) => g.parentSku);
    expect(skus).toEqual([...skus].sort((a, b) => a.localeCompare(b)));
  });

  it("inherits categoryPath from the first product in the group", () => {
    const products = [
      makeProduct({
        sku: "A-002",
        name: "Trophy Silver",
        categoryPath: ["Medals", "Dance"],
      }),
      makeProduct({
        sku: "A-001",
        name: "Trophy Gold",
        categoryPath: ["Medals", "Athletics"], // different but grouped by base name + default cat
      }),
    ];
    // Different categories → separate groups
    const result = groupProducts(products);
    // Each group's category path matches its own product
    const catA = result.find((g) => g.parentSku === "A-001");
    expect(catA!.categoryPath).toEqual(["Medals", "Athletics"]);
  });

  it("sets name to the base name stripped of suffixes", () => {
    const products = [
      makeProduct({ sku: "T-001", name: "Jetstream Dance Trophy Gold 150mm" }),
      makeProduct({ sku: "T-002", name: "Jetstream Dance Trophy Silver 200mm" }),
    ];
    const result = groupProducts(products);
    expect(result[0].name).toBe("Jetstream Dance Trophy");
  });

  it("falls back to the full product name when stripping leaves nothing", () => {
    // A name that is only a colour word — stripping leaves empty string → fall back
    const products = [
      makeProduct({ sku: "T-001", name: "Gold" }),
    ];
    const result = groupProducts(products);
    expect(result[0].name).toBe("Gold");
  });
});

// ---------------------------------------------------------------------------
// groupProducts — split group detection
// ---------------------------------------------------------------------------

describe("groupProducts — split group detection", () => {
  it("splits a group when variation attribute counts are wildly inconsistent (ratio > 3)", () => {
    // 3 colours with 4 sizes each (12 products) + 1 colour with 1 size (1 product)
    // ratio = 4/1 = 4 > 3 → split
    const products: RawProduct[] = [];

    for (const colour of ["Gold", "Silver", "Bronze"]) {
      for (const size of ["150mm", "200mm", "250mm", "300mm"]) {
        products.push(
          makeProduct({
            sku: `MAIN-${colour[0]}-${size}`,
            name: `Star Trophy ${colour} ${size}`,
            attributes: { pa_colour: colour, pa_size: size },
          })
        );
      }
    }

    products.push(
      makeProduct({
        sku: "OUTLIER-R-100mm",
        name: "Star Trophy Red 100mm",
        attributes: { pa_colour: "Red", pa_size: "100mm" },
      })
    );

    const config: GrouperConfig = {
      attributes: [
        { name: "Colour", slug: "pa_colour", isVariation: true, isGlobal: true },
        { name: "Size", slug: "pa_size", isVariation: true, isGlobal: true },
      ],
    };

    const result = groupProducts(products, config);
    expect(result).toHaveLength(2);

    const main = result.find((g) => g.variations.length > 1);
    const outlier = result.find((g) => g.variations.length === 1);
    expect(main).toBeDefined();
    expect(main!.variations).toHaveLength(12);
    expect(outlier).toBeDefined();
    expect(outlier!.variations).toHaveLength(1);
  });

  it("does not split when ratio is <= 3", () => {
    const products: RawProduct[] = [];

    for (const colour of ["Gold", "Silver"]) {
      for (const size of ["S", "M", "L"]) {
        products.push(
          makeProduct({
            sku: `T-${colour[0]}-${size}`,
            name: `Trophy ${colour}`,
            attributes: { pa_colour: colour, pa_size: size },
          })
        );
      }
    }
    for (const size of ["S", "M"]) {
      products.push(
        makeProduct({
          sku: `T-B-${size}`,
          name: `Trophy Bronze`,
          attributes: { pa_colour: "Bronze", pa_size: size },
        })
      );
    }

    const config: GrouperConfig = {
      attributes: [
        { name: "Colour", slug: "pa_colour", isVariation: true, isGlobal: true },
      ],
    };

    const result = groupProducts(products, config);
    expect(result).toHaveLength(1);
    expect(result[0].variations).toHaveLength(8);
  });

  it("does not split groups with fewer than 4 products", () => {
    const products = [
      makeProduct({ sku: "A-1", name: "Trophy Gold", attributes: { pa_colour: "Gold" } }),
      makeProduct({ sku: "A-2", name: "Trophy Silver", attributes: { pa_colour: "Silver" } }),
      makeProduct({ sku: "A-3", name: "Trophy Bronze", attributes: { pa_colour: "Bronze" } }),
    ];

    const config: GrouperConfig = {
      attributes: [
        { name: "Colour", slug: "pa_colour", isVariation: true, isGlobal: true },
      ],
    };

    const result = groupProducts(products, config);
    expect(result).toHaveLength(1);
    expect(result[0].variations).toHaveLength(3);
  });

  it("does not split when no variation attributes are configured", () => {
    const products: RawProduct[] = [];
    for (let i = 0; i < 10; i++) {
      products.push(makeProduct({ sku: `T-${i}`, name: "Trophy Gold" }));
    }

    const result = groupProducts(products);
    expect(result).toHaveLength(1);
  });

  it("split outlier becomes a simple product", () => {
    const products: RawProduct[] = [];

    for (const colour of ["Gold", "Silver"]) {
      for (let s = 1; s <= 5; s++) {
        products.push(
          makeProduct({
            sku: `M-${colour[0]}-${s}`,
            name: `Medal ${colour}`,
            attributes: { pa_colour: colour, pa_size: `${s * 50}mm` },
          })
        );
      }
    }

    products.push(
      makeProduct({
        sku: "M-R-1",
        name: "Medal Red",
        attributes: { pa_colour: "Red", pa_size: "100mm" },
      })
    );

    const config: GrouperConfig = {
      attributes: [
        { name: "Colour", slug: "pa_colour", isVariation: true, isGlobal: true },
      ],
    };

    const result = groupProducts(products, config);
    const outlier = result.find((g) => g.variations.length === 1);
    expect(outlier).toBeDefined();
    expect(outlier!.type).toBe("simple");
  });
});
