import { generateSeo } from "../../agents/seo.js";
import type { GroupedProduct, BusinessConfig } from "../../pipeline/models.js";
import type { ProductSeo } from "../../agents/seo.js";

/** Temporal activity: generate SEO fields for products */
export async function generateSeoActivity(
  products: GroupedProduct[],
  businessConfig: BusinessConfig,
): Promise<ProductSeo[]> {
  return generateSeo(products, businessConfig);
}
