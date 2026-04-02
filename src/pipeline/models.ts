// ---------------------------------------------------------------------------
// Discovery strategies (discriminated union)
// ---------------------------------------------------------------------------

export interface SitemapDiscovery {
  type: "sitemap";
  url: string;
  filterPatterns: string[];
}

export interface CategoryListSection {
  name: string;
  path: string;
  categories: string[];
}

export interface CategoryListDiscovery {
  type: "category-list";
  sections: CategoryListSection[];
}

export interface PaginationDiscovery {
  type: "pagination";
  listSelector: string;
  nextSelector: string;
}

export type DiscoveryStrategy =
  | SitemapDiscovery
  | CategoryListDiscovery
  | PaginationDiscovery;

// ---------------------------------------------------------------------------
// Variant strategies (discriminated union)
// ---------------------------------------------------------------------------

export interface SamePageVariants {
  type: "same-page";
  /** CSS selector for the variant switcher container (e.g. colour swatches) */
  containerSelector?: string;
}

export interface SeparatePagesVariants {
  type: "separate-pages";
  /** CSS selector for links to sibling/variant product pages */
  linkSelector: string;
}

export interface AjaxDropdownVariants {
  type: "ajax-dropdown";
  /** CSS selector for the <select> or dropdown element */
  dropdownSelector: string;
  /** URL template or endpoint that returns variant data */
  ajaxEndpoint?: string;
}

export type VariantStrategy =
  | SamePageVariants
  | SeparatePagesVariants
  | AjaxDropdownVariants;

// ---------------------------------------------------------------------------
// Variant extraction strategies (how to extract variant data from HTML)
// ---------------------------------------------------------------------------

export interface TemplateTagExtraction {
  method: "template-tags";
  /** CSS selector or regex for template elements, e.g. "template[data-temp-id]" */
  templateSelector: string;
  /** Attribute containing the variant SKU, e.g. "data-temp-id" */
  skuAttribute: string;
  /** How to parse inner HTML of each template */
  innerFormat: "table" | "list";
}

export interface SelectDropdownExtraction {
  method: "select-dropdown";
  /** CSS selector for the dropdown, e.g. "select.jsVariationDropdown" */
  dropdownSelector: string;
  /** How to derive variant SKUs from dropdown options */
  skuInference: "increment-last-letter" | "from-option-value" | "from-option-data";
}

export interface VisibleTableExtraction {
  method: "visible-table";
  /** CSS selector for the product data table */
  tableSelector: string;
}

export interface BulletListExtraction {
  method: "bullet-list";
  /** CSS selector for list items containing attributes */
  listSelector: string;
  /** Known attribute keys to extract (e.g. ["Colour", "Material", "Weight(g)"]) */
  knownKeys: string[];
}

export interface InteractiveExtraction {
  method: "interactive";
  /** Playwright interaction steps to reveal variant data */
  steps: Array<{
    action: "click" | "select" | "wait";
    selector: string;
    value?: string;
    waitFor?: string;
  }>;
}

export type VariantExtraction =
  | TemplateTagExtraction
  | SelectDropdownExtraction
  | VisibleTableExtraction
  | BulletListExtraction
  | InteractiveExtraction;

// ---------------------------------------------------------------------------
// Attribute definition
// ---------------------------------------------------------------------------

export interface AttributeDef {
  /** Display name — e.g. "Colour", "Size", "Material" */
  name: string;
  /** WooCommerce taxonomy slug — e.g. "pa_colour" */
  slug: string;
  /** true = used to generate product variations */
  isVariation: boolean;
  /** true = WooCommerce global/taxonomy attribute */
  isGlobal: boolean;
  /** CSS selector on the product page that exposes this attribute */
  selector?: string;
  /** Named transform to apply: "strip_prefix", "reorder_colours", "replace_slashes", "format_number", "colour_cleanup" */
  transform?: string;
  /** Argument for parameterised transforms (e.g. prefix string for "strip_prefix", default "Antique") */
  transformArg?: string;
  /** true = auto-assign S/M/L/XL labels based on variant count */
  sizeLabels?: boolean;
}

// ---------------------------------------------------------------------------
// CSS selector map for product page fields
// ---------------------------------------------------------------------------

export interface SelectorMap {
  name: string;
  sku: string;
  price?: string;
  images: string;
  description?: string;
  shortDescription?: string;
  weight?: string;
  width?: string;
  height?: string;
  categoryBreadcrumb?: string;
  /** Extra selectors keyed by attribute slug */
  extra?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Site configuration
// ---------------------------------------------------------------------------

export interface SiteConfig {
  /** Machine-readable identifier — e.g. "trophies-com-au" */
  name: string;
  /** Root URL — e.g. "https://trophies.com.au" */
  baseUrl: string;
  /** Strategy used to discover product pages */
  discovery: DiscoveryStrategy;
  /** CSS selectors for scraping product page fields */
  selectors: SelectorMap;
  /** Dynamic attribute definitions for this site */
  attributes: AttributeDef[];
  /** Milliseconds to wait between requests */
  rateLimit: number;
  /** Strategy for finding size/colour variants */
  variants: VariantStrategy;
  /** Maps URL slugs to display names (overrides auto-derived names) */
  categoryMap?: Record<string, string>;
  /** Category slugs/names to skip during scraping */
  skipCategories?: string[];
  /** Which scraping pipeline tier to use */
  pipeline: "http-direct" | "sitemap-http" | "playwright";
  /** How to extract variant data from product pages */
  variantExtraction: VariantExtraction;
}

// ---------------------------------------------------------------------------
// Business / SEO configuration
// ---------------------------------------------------------------------------

export interface BusinessConfig {
  /** Studio name — e.g. "My Trophy Shop" */
  name: string;
  /** Physical location — e.g. "Sydney NSW" */
  location: string;
  /** Target marketing region — e.g. "Inner West" */
  region: string;
  seoTemplates: {
    /** Template for meta title — e.g. "{keywords} {region} | {productName}" */
    metaTitle: string;
    /** Template for meta description */
    metaDescription: string;
  };
}

// ---------------------------------------------------------------------------
// Raw product (as scraped, before grouping or enrichment)
// ---------------------------------------------------------------------------

export interface RawProduct {
  sku: string;
  name: string;
  sourceUrl: string;
  /** Category hierarchy from broadest to most specific */
  categoryPath: string[];
  /** Attribute slug → raw value as found on the page */
  attributes: Record<string, string>;
  price?: number;
  images: string[];
  dimensions?: {
    weight?: number;
    width?: number;
    height?: number;
  };
  description?: string;
  shortDescription?: string;  // supplier's original short description
  scrapedAt: string;  // ISO 8601 timestamp
}

// ---------------------------------------------------------------------------
// Grouped product (after consolidating colour/size variants into one parent)
// ---------------------------------------------------------------------------

export interface GroupedProduct {
  parentSku: string;
  name: string;
  type: "simple" | "variable";
  categoryPath: string[];
  /** Individual variant products (each RawProduct is one variation) */
  variations: RawProduct[];
  /** Attribute slug → all distinct values across variations */
  attributeValues: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Enriched product (after AI description + SEO generation)
// ---------------------------------------------------------------------------

export interface EnrichedProduct extends GroupedProduct {
  shortDescription: string;
  longDescription: string;
  metaTitle: string;
  metaDescription: string;
  /** URL-friendly slug ending with the SEO keyword */
  permalink: string;
  keywords: string;
}
