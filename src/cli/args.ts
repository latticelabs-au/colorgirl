import { parseArgs } from "node:util";

const VERSION = "0.1.0";

export interface CliArgs {
  help: boolean;
  version: boolean;
  noColor: boolean;
  url: string | null;
}

export function parseCliArgs(): CliArgs {
  const { values, positionals } = parseArgs({
    options: {
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", default: false },
      "no-color": { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  return {
    help: !!values.help,
    version: !!values.version,
    noColor: !!values["no-color"],
    url: positionals[0] ?? null,
  };
}

export function printHelp(): void {
  console.log(`
ColorGirl v${VERSION}
AI-powered product scraper → WooCommerce CSV

Usage:
  colorgirl [options] [url]

Options:
  -h, --help       Show this help
  --version        Show version
  --no-color       Disable colors

Examples:
  colorgirl                           Interactive mode
  colorgirl https://supplier.com      Skip URL input, start analyzing
`);
}

export function printVersion(): void {
  console.log(VERSION);
}
