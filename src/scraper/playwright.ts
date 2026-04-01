import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

// ---------------------------------------------------------------------------
// Browser management — Playwright lifecycle with stealth + rate limiting
// ---------------------------------------------------------------------------

export interface BrowserOptions {
  /** Milliseconds to wait between requests */
  rateLimit: number;
  /** Optional proxy URL (e.g. "http://proxy:8080") */
  proxy?: string;
  /** Launch in headless mode (default: true) */
  headless?: boolean;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private lastRequestTime = 0;

  constructor(private options: BrowserOptions) {}

  /**
   * Launch Chromium with stealth flags and configure browser context.
   */
  async launch(): Promise<void> {
    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: this.options.headless ?? true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    };

    if (this.options.proxy) {
      launchOptions.proxy = { server: this.options.proxy };
    }

    this.browser = await chromium.launch(launchOptions);
    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
    });
  }

  /**
   * Navigate to a URL, enforcing rate limiting between requests.
   * Returns the page after navigation completes.
   */
  async goto(url: string): Promise<Page> {
    await this.enforceRateLimit();

    const page = await this.page();
    await page.goto(url, { waitUntil: "networkidle" });
    this.lastRequestTime = Date.now();
    return page;
  }

  /**
   * Get the current page (creates one if the context has none).
   */
  async page(): Promise<Page> {
    if (!this.context) {
      throw new Error("BrowserManager not launched — call launch() first");
    }
    const pages = this.context.pages();
    return pages.length > 0 ? pages[0] : await this.context.newPage();
  }

  /**
   * Close the browser and clean up resources.
   */
  async close(): Promise<void> {
    try {
      await this.context?.close();
    } finally {
      this.context = null;
      try {
        await this.browser?.close();
      } finally {
        this.browser = null;
      }
    }
  }

  /**
   * Wait if less than rateLimit ms have passed since the last request.
   */
  private async enforceRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    const remaining = this.options.rateLimit - elapsed;
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }
}
