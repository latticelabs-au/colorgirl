import * as cheerio from "cheerio";

export interface ParsedPage {
  /** Extract trimmed text from the first element matching selector. Returns "" if missing. */
  text(selector: string): string;
  /** Extract trimmed text, or undefined if missing. */
  optionalText(selector: string): string | undefined;
  /** Extract a number from element text (strips non-numeric chars). undefined if missing/NaN. */
  optionalNumber(selector: string): number | undefined;
  /** Extract trimmed text from ALL elements matching selector. */
  allText(selector: string): string[];
  /** Extract an attribute value from ALL matching elements. */
  allAttr(selector: string, attr: string): string[];
  /** Check whether at least one element matches the selector. */
  exists(selector: string): boolean;
  /** Return inner HTML of the first matching element. */
  html(selector: string): string;
  /** Return the full raw HTML string that was parsed. */
  raw(): string;
  /** Access the underlying cheerio instance for advanced queries. */
  $: cheerio.CheerioAPI;
}

export function parseHtml(html: string): ParsedPage {
  const $ = cheerio.load(html);

  return {
    text(selector: string): string {
      return $(selector).first().text().trim();
    },

    optionalText(selector: string): string | undefined {
      const el = $(selector).first();
      if (el.length === 0) return undefined;
      const t = el.text().trim();
      return t || undefined;
    },

    optionalNumber(selector: string): number | undefined {
      const el = $(selector).first();
      if (el.length === 0) return undefined;
      const t = el.text().trim();
      if (!t) return undefined;
      const parsed = parseFloat(t.replace(/[^0-9.\-]/g, ""));
      return isNaN(parsed) ? undefined : parsed;
    },

    allText(selector: string): string[] {
      const results: string[] = [];
      $(selector).each((_, el) => {
        const t = $(el).text().trim();
        if (t) results.push(t);
      });
      return results;
    },

    allAttr(selector: string, attr: string): string[] {
      const results: string[] = [];
      $(selector).each((_, el) => {
        const v = $(el).attr(attr);
        if (v) results.push(v);
      });
      return results;
    },

    exists(selector: string): boolean {
      return $(selector).length > 0;
    },

    html(selector: string): string {
      return $(selector).first().html() ?? "";
    },

    raw(): string {
      return html;
    },

    $,
  };
}
