import { describe, it, expect } from "vitest";
import { parseHtml } from "../html-parser.js";

const SAMPLE_HTML = `
<html><body>
  <h1 class="product-name">Dance Trophy Gold</h1>
  <span class="sku">TRP-001</span>
  <span class="price">$29.95</span>
  <div class="images">
    <img src="https://example.com/img1.jpg">
    <img src="https://example.com/img2.jpg">
  </div>
  <table class="specs">
    <tr><td>Weight</td><td>150g</td></tr>
    <tr><td>Material</td><td>Resin</td></tr>
  </table>
  <ul class="attrs">
    <li>Colour: Gold</li>
    <li>Size: 150mm</li>
  </ul>
  <nav class="breadcrumb">
    <a href="/">Home</a>
    <a href="/trophies">Trophies</a>
    <a href="/trophies/dance">Dance</a>
  </nav>
</body></html>
`;

describe("parseHtml", () => {
  it("returns a ParsedPage with query methods", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.text).toBeDefined();
    expect(page.optionalText).toBeDefined();
    expect(page.optionalNumber).toBeDefined();
    expect(page.allText).toBeDefined();
    expect(page.allAttr).toBeDefined();
    expect(page.exists).toBeDefined();
    expect(page.html).toBeDefined();
    expect(page.raw).toBeDefined();
  });
});

describe("ParsedPage.text", () => {
  it("extracts trimmed text content from a CSS selector", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.text(".product-name")).toBe("Dance Trophy Gold");
  });

  it("returns empty string when selector matches nothing", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.text(".nonexistent")).toBe("");
  });
});

describe("ParsedPage.optionalText", () => {
  it("returns string when element exists", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.optionalText(".sku")).toBe("TRP-001");
  });

  it("returns undefined when element is missing", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.optionalText(".nonexistent")).toBeUndefined();
  });
});

describe("ParsedPage.optionalNumber", () => {
  it("parses numeric text from an element", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.optionalNumber(".price")).toBe(29.95);
  });

  it("returns undefined for missing elements", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.optionalNumber(".nonexistent")).toBeUndefined();
  });
});

describe("ParsedPage.allText", () => {
  it("returns an array of text from all matching elements", () => {
    const page = parseHtml(SAMPLE_HTML);
    const crumbs = page.allText(".breadcrumb a");
    expect(crumbs).toEqual(["Home", "Trophies", "Dance"]);
  });

  it("returns empty array when nothing matches", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.allText(".nothing")).toEqual([]);
  });
});

describe("ParsedPage.allAttr", () => {
  it("extracts attribute values from all matching elements", () => {
    const page = parseHtml(SAMPLE_HTML);
    const srcs = page.allAttr(".images img", "src");
    expect(srcs).toEqual([
      "https://example.com/img1.jpg",
      "https://example.com/img2.jpg",
    ]);
  });
});

describe("ParsedPage.exists", () => {
  it("returns true when element exists", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.exists(".product-name")).toBe(true);
  });

  it("returns false when element is missing", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.exists(".nope")).toBe(false);
  });
});

describe("ParsedPage.html", () => {
  it("returns inner HTML of matched element", () => {
    const page = parseHtml("<div class='box'><b>bold</b></div>");
    expect(page.html(".box")).toBe("<b>bold</b>");
  });
});

describe("ParsedPage.raw", () => {
  it("returns the full HTML string", () => {
    const page = parseHtml(SAMPLE_HTML);
    expect(page.raw()).toContain("Dance Trophy Gold");
  });
});
