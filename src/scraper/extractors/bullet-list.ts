import type { BulletListExtraction } from "../../pipeline/models.js";
import { parseHtml } from "../html-parser.js";

/**
 * Extract attribute key-value pairs from a bullet list.
 * Parses "Key: Value" patterns and filters to known keys.
 */
export function extractBulletList(
  html: string,
  config: BulletListExtraction,
): Record<string, string> {
  const page = parseHtml(html);
  const knownSet = new Set(config.knownKeys);
  const data: Record<string, string> = {};

  page.$(config.listSelector).each((_, li) => {
    const text = page.$(li).text().trim();
    const colonIdx = text.indexOf(":");
    if (colonIdx <= 0) return;
    const key = text.slice(0, colonIdx).trim();
    const val = text.slice(colonIdx + 1).trim();
    if (knownSet.has(key)) {
      data[key] = val;
    }
  });

  return data;
}
