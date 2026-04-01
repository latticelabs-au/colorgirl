// Workflows barrel — export Temporal workflow functions and signal/query definitions
export {
  scrapeWorkflow,
  mergeEnrichment,
  configApprovedSignal,
  productsApprovedSignal,
  exportApprovedSignal,
  getStatusQuery,
  getProductsQuery,
  getProgressQuery,
  getPreviewQuery,
} from "./scrape-workflow.js";

export type {
  WorkflowStatus,
  WorkflowProgress,
  ScrapeWorkflowInput,
} from "./scrape-workflow.js";
