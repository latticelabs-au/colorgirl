import type { SiteConfig, RawProduct } from "../pipeline/models.js";
import { httpDirectPipeline } from "./pipelines/http-direct.js";
import { sitemapHttpPipeline } from "./pipelines/sitemap-http.js";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ScrapeOptions {
  config: SiteConfig;
  /** Optional subset of categories to scrape */
  categories?: string[];
  /** Progress callback invoked during discovery and scraping */
  onProgress?: (progress: ScrapeProgress) => void;
}

export interface ScrapeProgress {
  phase: "discovering" | "scraping";
  current: number;
  total: number;
  currentUrl?: string;
}

export interface ScrapeResult {
  products: RawProduct[];
  errors: ScrapeError[];
}

export interface ScrapeError {
  url: string;
  error: string;
  retries: number;
}

// ---------------------------------------------------------------------------
// Retry helper — exponential backoff
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Execute an async function with exponential backoff retry.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;

      // Exponential backoff: 1s, 2s, 4s
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Main scrape entry point — dispatches to correct pipeline tier
// ---------------------------------------------------------------------------

/**
 * Main scrape entry point. Dispatches to the correct pipeline
 * based on SiteConfig.pipeline tier.
 */
export async function scrape(options: ScrapeOptions): Promise<ScrapeResult> {
  const { config, onProgress } = options;

  switch (config.pipeline) {
    case "http-direct":
      return httpDirectPipeline(config, onProgress);

    case "sitemap-http":
      return sitemapHttpPipeline(config, onProgress);

    case "playwright": {
      // Lazy import to avoid requiring Playwright when not needed
      const { playwrightPipeline } = await import("./pipelines/playwright.js");
      return playwrightPipeline(config, onProgress);
    }

    default:
      throw new Error(`Unknown pipeline: ${(config as any).pipeline}`);
  }
}
