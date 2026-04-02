import type { TemplateTagExtraction } from "../../pipeline/models.js";
import { parseHtml } from "../html-parser.js";

export interface TemplateVariant {
  sku: string;
  data: Record<string, string>;
}

/**
 * Extract variant data from <template> tags embedded in HTML.
 * Uses regex to find template elements (cheerio doesn't parse <template> content
 * by default), then parses inner HTML with cheerio.
 */
export function extractTemplateTags(
  html: string,
  config: TemplateTagExtraction,
): TemplateVariant[] {
  const results: TemplateVariant[] = [];

  const attrName = escapeRegex(config.skuAttribute);
  const re = new RegExp(
    `<template[^>]*?${attrName}="([^"]+)"[^>]*>(.*?)</template>`,
    "gs",
  );

  for (const match of html.matchAll(re)) {
    const sku = match[1];
    const innerHtml = match[2];
    const data = config.innerFormat === "table"
      ? parseTable(innerHtml)
      : parseList(innerHtml);
    results.push({ sku, data });
  }

  return results;
}

function parseTable(html: string): Record<string, string> {
  const page = parseHtml(html);
  const data: Record<string, string> = {};
  page.$("tr").each((_, row) => {
    const cells = page.$(row).find("td");
    if (cells.length >= 2) {
      const key = page.$(cells[0]).text().trim();
      const val = page.$(cells[1]).text().trim();
      if (key) data[key] = val;
    }
  });
  return data;
}

function parseList(html: string): Record<string, string> {
  const page = parseHtml(html);
  const data: Record<string, string> = {};
  page.$("li").each((_, li) => {
    const text = page.$(li).text().trim();
    const colonIdx = text.indexOf(":");
    if (colonIdx > 0) {
      const key = text.slice(0, colonIdx).trim();
      const val = text.slice(colonIdx + 1).trim();
      if (key) data[key] = val;
    }
  });
  return data;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
