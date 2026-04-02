import axios, { type AxiosInstance } from "axios";

export interface HttpClientOptions {
  /** Milliseconds to wait between requests */
  rateLimit: number;
  /** Optional proxy URL */
  proxy?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Custom User-Agent string */
  userAgent?: string;
}

export interface HttpClient {
  /** Fetch a URL and return HTML body as string */
  get(url: string): Promise<string>;
  /** Fetch a URL and return raw response as Buffer (for .gz sitemaps) */
  getRaw(url: string): Promise<Buffer>;
}

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const timeout = options.timeout ?? 30_000;

  const instance: AxiosInstance = axios.create({
    timeout,
    headers: { "User-Agent": options.userAgent ?? DEFAULT_UA },
    maxRedirects: 5,
  });

  let lastRequestTime = 0;

  async function enforceRateLimit(): Promise<void> {
    if (options.rateLimit <= 0) return;
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed < options.rateLimit) {
      await new Promise((r) => setTimeout(r, options.rateLimit - elapsed));
    }
  }

  return {
    async get(url: string): Promise<string> {
      await enforceRateLimit();
      lastRequestTime = Date.now();
      const resp = await instance.get<string>(url, { responseType: "text" });
      return resp.data;
    },

    async getRaw(url: string): Promise<Buffer> {
      await enforceRateLimit();
      lastRequestTime = Date.now();
      const resp = await instance.get(url, { responseType: "arraybuffer" });
      return Buffer.from(resp.data);
    },
  };
}
