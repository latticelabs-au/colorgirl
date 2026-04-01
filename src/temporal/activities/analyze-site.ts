import { analyzeSite } from "../../agents/site-recon.js";
import type { SiteConfig } from "../../pipeline/models.js";

/** Temporal activity: use Opus agent to analyse a supplier site */
export async function analyzeSiteActivity(url: string): Promise<SiteConfig> {
  return analyzeSite(url);
}
