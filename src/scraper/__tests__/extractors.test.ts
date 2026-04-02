import { describe, it, expect } from "vitest";
import { extractTemplateTags } from "../extractors/template-tags.js";
import { extractSelectDropdown } from "../extractors/select-dropdown.js";
import { extractTable } from "../extractors/table-parser.js";
import { extractBulletList } from "../extractors/bullet-list.js";
import { extractBreadcrumb } from "../extractors/breadcrumb.js";

// ---------------------------------------------------------------------------
// Template tags
// ---------------------------------------------------------------------------

describe("extractTemplateTags", () => {
  it("extracts variant SKUs and table data from <template> tags", () => {
    const html = `
      <div class="product">
        <template data-temp-id="CR198A">
          <table>
            <tr><td>Product Code</td><td>CR198A</td></tr>
            <tr><td>Size</td><td>100mm</td></tr>
            <tr><td>Weight</td><td>50g</td></tr>
          </table>
        </template>
        <template data-temp-id="CR198B">
          <table>
            <tr><td>Product Code</td><td>CR198B</td></tr>
            <tr><td>Size</td><td>150mm</td></tr>
            <tr><td>Weight</td><td>80g</td></tr>
          </table>
        </template>
      </div>`;

    const results = extractTemplateTags(html, {
      method: "template-tags",
      templateSelector: "template[data-temp-id]",
      skuAttribute: "data-temp-id",
      innerFormat: "table",
    });

    expect(results).toHaveLength(2);
    expect(results[0].sku).toBe("CR198A");
    expect(results[0].data["Product Code"]).toBe("CR198A");
    expect(results[0].data["Size"]).toBe("100mm");
    expect(results[1].sku).toBe("CR198B");
    expect(results[1].data["Size"]).toBe("150mm");
  });

  it("returns empty array when no templates match", () => {
    const results = extractTemplateTags("<div>no templates</div>", {
      method: "template-tags",
      templateSelector: "template[data-temp-id]",
      skuAttribute: "data-temp-id",
      innerFormat: "table",
    });
    expect(results).toEqual([]);
  });

  it("handles list innerFormat (li elements)", () => {
    const html = `
      <template data-sku="V1">
        <ul><li>Colour: Red</li><li>Weight: 50g</li></ul>
      </template>`;

    const results = extractTemplateTags(html, {
      method: "template-tags",
      templateSelector: "template[data-sku]",
      skuAttribute: "data-sku",
      innerFormat: "list",
    });

    expect(results).toHaveLength(1);
    expect(results[0].sku).toBe("V1");
    expect(results[0].data["Colour"]).toBe("Red");
    expect(results[0].data["Weight"]).toBe("50g");
  });
});

// ---------------------------------------------------------------------------
// Select dropdown
// ---------------------------------------------------------------------------

describe("extractSelectDropdown", () => {
  it("extracts options from a select element with letter incrementing", () => {
    const html = `
      <select class="jsVariationDropdown">
        <option value="137">100</option>
        <option value="105">150</option>
        <option value="85">200</option>
      </select>`;

    const results = extractSelectDropdown(html, {
      method: "select-dropdown",
      dropdownSelector: "select.jsVariationDropdown",
      skuInference: "increment-last-letter",
    }, "D504A");

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ sku: "D504A", optionValue: "137", optionText: "100" });
    expect(results[1]).toEqual({ sku: "D504B", optionValue: "105", optionText: "150" });
    expect(results[2]).toEqual({ sku: "D504C", optionValue: "85", optionText: "200" });
  });

  it("uses from-option-value inference", () => {
    const html = `
      <select class="sizes">
        <option value="SKU-100">Small</option>
        <option value="SKU-200">Large</option>
      </select>`;

    const results = extractSelectDropdown(html, {
      method: "select-dropdown",
      dropdownSelector: "select.sizes",
      skuInference: "from-option-value",
    }, "PARENT");

    expect(results[0].sku).toBe("SKU-100");
    expect(results[1].sku).toBe("SKU-200");
  });

  it("returns empty array when no dropdown found", () => {
    const results = extractSelectDropdown("<div>nothing</div>", {
      method: "select-dropdown",
      dropdownSelector: "select.missing",
      skuInference: "increment-last-letter",
    }, "SKU-A");

    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Table parser
// ---------------------------------------------------------------------------

describe("extractTable", () => {
  it("extracts key-value pairs from table rows", () => {
    const html = `
      <table class="specs">
        <tr><td>Product Code</td><td>CR198A</td></tr>
        <tr><td>Size</td><td>150mm</td></tr>
        <tr><td>Weight</td><td>200g</td></tr>
      </table>`;

    const data = extractTable(html, { method: "visible-table", tableSelector: "table.specs" });
    expect(data).toEqual({
      "Product Code": "CR198A",
      "Size": "150mm",
      "Weight": "200g",
    });
  });

  it("returns empty object when table not found", () => {
    const data = extractTable("<div>no table</div>", { method: "visible-table", tableSelector: "table" });
    expect(data).toEqual({});
  });

  it("skips rows with fewer than 2 cells", () => {
    const html = `<table><tr><td>header</td></tr><tr><td>Key</td><td>Val</td></tr></table>`;
    const data = extractTable(html, { method: "visible-table", tableSelector: "table" });
    expect(data).toEqual({ "Key": "Val" });
  });
});

// ---------------------------------------------------------------------------
// Bullet list
// ---------------------------------------------------------------------------

describe("extractBulletList", () => {
  it("extracts known key-value pairs from li elements", () => {
    const html = `
      <ul class="attrs">
        <li>Colour: Gold</li>
        <li>Material: Resin</li>
        <li>Some random text</li>
        <li>Weight(g): 150</li>
      </ul>`;

    const data = extractBulletList(html, {
      method: "bullet-list",
      listSelector: "ul.attrs li",
      knownKeys: ["Colour", "Material", "Weight(g)"],
    });

    expect(data).toEqual({
      "Colour": "Gold",
      "Material": "Resin",
      "Weight(g)": "150",
    });
  });

  it("ignores items without colon or with unknown keys", () => {
    const html = `<ul><li>no colon here</li><li>Unknown: value</li></ul>`;
    const data = extractBulletList(html, {
      method: "bullet-list",
      listSelector: "ul li",
      knownKeys: ["Known"],
    });
    expect(data).toEqual({});
  });

  it("returns empty object when no list items found", () => {
    const data = extractBulletList("<div>nothing</div>", {
      method: "bullet-list",
      listSelector: "li",
      knownKeys: ["Colour"],
    });
    expect(data).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------

describe("extractBreadcrumb", () => {
  it("extracts category path from breadcrumb links", () => {
    const html = `
      <nav class="breadcrumb">
        <a href="/">Home</a> > <a href="/trophies">Trophies</a> > <a href="/trophies/dance">Dance</a>
      </nav>`;

    const path = extractBreadcrumb(html, ".breadcrumb a");
    expect(path).toEqual(["Home", "Trophies", "Dance"]);
  });

  it("returns empty array when selector matches nothing", () => {
    expect(extractBreadcrumb("<div></div>", ".breadcrumb a")).toEqual([]);
  });

  it("skips empty text nodes", () => {
    const html = `<div class="bc"><a>Home</a><a>  </a><a>Trophies</a></div>`;
    const path = extractBreadcrumb(html, ".bc a");
    expect(path).toEqual(["Home", "Trophies"]);
  });
});
