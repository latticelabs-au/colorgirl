import { groupProducts } from "../../pipeline/grouper.js";
import type { RawProduct, GroupedProduct, AttributeDef } from "../../pipeline/models.js";

/** Temporal activity: group raw products into parent/variation structure */
export async function groupProductsActivity(
  products: RawProduct[],
  attributes?: AttributeDef[],
): Promise<GroupedProduct[]> {
  return groupProducts(products, { attributes });
}
