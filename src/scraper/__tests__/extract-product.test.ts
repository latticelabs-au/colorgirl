import { describe, it, expect } from "vitest";
import { extractProductsFromHtml } from "../extract-product.js";
import type { SiteConfig } from "../../pipeline/models.js";

function makeConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    name: "test",
    baseUrl: "https://example.com",
    discovery: { type: "sitemap", url: "https://example.com/sitemap.xml", filterPatterns: [] },
    selectors: { name: ".name", sku: ".sku", images: ".images img" },
    attributes: [],
    rateLimit: 0,
    variants: { type: "same-page" },
    pipeline: "http-direct",
    variantExtraction: { method: "visible-table", tableSelector: "table" },
    ...overrides,
  };
}

describe("extractProductsFromHtml", () => {
  it("extracts a single simple product from HTML", () => {
    const html = `
      <h1 class="name">Dance Trophy Gold</h1>
      <span class="sku">TRP-001</span>
      <div class="images"><img src="https://example.com/img1.jpg"></div>
      <table><tr><td>Weight</td><td>150g</td></tr></table>`;

    const config = makeConfig();
    const products = extractProductsFromHtml(html, "https://example.com/product-1", config);

    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("Dance Trophy Gold");
    expect(products[0].sku).toBe("TRP-001");
    expect(products[0].images).toEqual(["https://example.com/img1.jpg"]);
    expect(products[0].sourceUrl).toBe("https://example.com/product-1");
    expect(products[0].scrapedAt).toBeDefined();
    expect(products[0].attributes["Weight"]).toBe("150g");
  });

  it("extracts multiple variants from template tags", () => {
    const html = `
      <h1 class="name">Trophy</h1>
      <span class="sku">CR198</span>
      <div class="images"><img src="https://example.com/img.jpg"></div>
      <template data-temp-id="CR198A">
        <table><tr><td>Size</td><td>100mm</td></tr></table>
      </template>
      <template data-temp-id="CR198B">
        <table><tr><td>Size</td><td>150mm</td></tr></table>
      </template>`;

    const config = makeConfig({
      variantExtraction: {
        method: "template-tags",
        templateSelector: "template[data-temp-id]",
        skuAttribute: "data-temp-id",
        innerFormat: "table",
      },
    });

    const products = extractProductsFromHtml(html, "https://example.com/p", config);

    expect(products).toHaveLength(2);
    expect(products[0].sku).toBe("CR198A");
    expect(products[0].attributes["Size"]).toBe("100mm");
    expect(products[1].sku).toBe("CR198B");
    expect(products[1].attributes["Size"]).toBe("150mm");
  });

  it("extracts variants from select dropdown with SKU inference", () => {
    const html = `
      <h1 class="name">Star Stand</h1>
      <span class="sku">D504A</span>
      <div class="images"><img src="https://example.com/img.jpg"></div>
      <select class="jsVariationDropdown">
        <option value="100">100</option>
        <option value="150">150</option>
        <option value="200">200</option>
      </select>`;

    const config = makeConfig({
      variantExtraction: {
        method: "select-dropdown",
        dropdownSelector: "select.jsVariationDropdown",
        skuInference: "increment-last-letter",
      },
    });

    const products = extractProductsFromHtml(html, "https://example.com/p", config);

    expect(products).toHaveLength(3);
    expect(products[0].sku).toBe("D504A");
    expect(products[1].sku).toBe("D504B");
    expect(products[2].sku).toBe("D504C");
  });

  it("throws when name selector matches nothing", () => {
    const html = `<div>empty page</div>`;
    const config = makeConfig();

    expect(() =>
      extractProductsFromHtml(html, "https://example.com/p", config)
    ).toThrow("Missing product name");
  });

  it("throws when sku selector matches nothing", () => {
    const html = `<h1 class="name">Trophy</h1>`;
    const config = makeConfig();

    expect(() =>
      extractProductsFromHtml(html, "https://example.com/p", config)
    ).toThrow("Missing product SKU");
  });

  it("extracts optional fields: price, description, breadcrumb, extra attributes", () => {
    const html = `
      <h1 class="name">Trophy</h1>
      <span class="sku">SKU-1</span>
      <div class="images"><img src="https://example.com/img.jpg"></div>
      <span class="price">$29.95</span>
      <p class="desc">A fine trophy</p>
      <nav class="bc"><a>Home</a><a>Trophies</a></nav>
      <span class="colour">Gold</span>`;

    const config = makeConfig({
      selectors: {
        name: ".name",
        sku: ".sku",
        images: ".images img",
        price: ".price",
        description: ".desc",
        categoryBreadcrumb: ".bc a",
        extra: { pa_colour: ".colour" },
      },
    });

    const products = extractProductsFromHtml(html, "https://example.com/p", config);
    expect(products[0].price).toBe(29.95);
    expect(products[0].description).toBe("A fine trophy");
    expect(products[0].categoryPath).toEqual(["Home", "Trophies"]);
    expect(products[0].attributes["pa_colour"]).toBe("Gold");
  });

  it("extracts bullet list attributes", () => {
    const html = `
      <h1 class="name">Medal</h1>
      <span class="sku">M-001</span>
      <div class="images"><img src="https://example.com/img.jpg"></div>
      <ul class="attrs">
        <li>Colour: Silver</li>
        <li>Material: Zinc</li>
      </ul>`;

    const config = makeConfig({
      variantExtraction: {
        method: "bullet-list",
        listSelector: "ul.attrs li",
        knownKeys: ["Colour", "Material"],
      },
    });

    const products = extractProductsFromHtml(html, "https://example.com/p", config);
    expect(products).toHaveLength(1);
    expect(products[0].attributes["Colour"]).toBe("Silver");
    expect(products[0].attributes["Material"]).toBe("Zinc");
  });
});
