import { parseHtml } from "../html-parser.js";

/**
 * Extract a category path from breadcrumb navigation.
 */
export function extractBreadcrumb(html: string, selector: string): string[] {
  const page = parseHtml(html);
  return page.allText(selector);
}
