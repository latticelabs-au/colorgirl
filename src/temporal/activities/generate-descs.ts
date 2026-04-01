import { generateDescriptions } from "../../agents/descriptions.js";
import type { GroupedProduct } from "../../pipeline/models.js";
import type { ProductDescription } from "../../agents/descriptions.js";

/** Temporal activity: generate AI descriptions for a batch of products */
export async function generateDescsActivity(
  products: GroupedProduct[],
): Promise<ProductDescription[]> {
  return generateDescriptions(products);
}
