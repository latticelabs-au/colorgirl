import { parseArgs } from "node:util";

export const VERSION = "1.2.4";

export interface CliArgs {
  help: boolean;
  version: boolean;
  noColor: boolean;
  url: string | null;
  resume: string | null;
}

export function parseCliArgs(): CliArgs {
  const { values, positionals } = parseArgs({
    options: {
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", default: false },
      "no-color": { type: "boolean", default: false },
      resume: { type: "string", short: "r" },
    },
    allowPositionals: true,
    strict: false,
  });

  return {
    help: !!values.help,
    version: !!values.version,
    noColor: !!values["no-color"],
    url: positionals[0] ?? null,
    resume: (values.resume as string) ?? null,
  };
}

export function printHelp(): void {
  console.log(`
ColorGirl v${VERSION}
AI-powered product scraper → WooCommerce CSV

Usage:
  colorgirl [options] [url]

Options:
  -h, --help           Show this help
  --version            Show version
  --no-color           Disable colors
  -r, --resume <id>    Resume a previous workflow by ID

Examples:
  colorgirl                           Interactive mode
  colorgirl https://supplier.com      Skip URL input, start analyzing
  colorgirl --resume colorgirl-123    Resume a previous session
`);
}

export function printVersion(): void {
  console.log(VERSION);
}
