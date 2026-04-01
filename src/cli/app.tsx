#!/usr/bin/env node
import React, { useState, useEffect, useCallback, useRef } from "react";
import { render, useApp, useInput } from "ink";
import { Client } from "@temporalio/client";
import { createTemporalClient, TASK_QUEUE } from "../temporal/client.js";
import {
  getStatusQuery,
  getProductsQuery,
  getProgressQuery,
  getPreviewQuery,
  getSuggestedConfigQuery,
  getScrapeErrorsQuery,
  configApprovedSignal,
  productsApprovedSignal,
  exportApprovedSignal,
} from "../temporal/workflows/index.js";
import type {
  WorkflowStatus,
  WorkflowProgress,
  ScrapeWorkflowInput,
} from "../temporal/workflows/index.js";
import type {
  SiteConfig,
  BusinessConfig,
  GroupedProduct,
  EnrichedProduct,
} from "../pipeline/models.js";
import type { ScrapeError } from "../scraper/engine.js";

import {
  WelcomeScreen,
  UrlInputScreen,
  AnalysisScreen,
  ConfigScreen,
  ScrapeProgressScreen,
  ProductReviewScreen,
  EnrichmentScreen,
  PreviewScreen,
  ExportScreen,
} from "./screens/index.js";

// ── Screen type ─────────────────────────────────────────
export type Screen =
  | "welcome"
  | "url-input"
  | "analyzing"
  | "config"
  | "scraping"
  | "product-review"
  | "enriching"
  | "preview"
  | "export";

// ── Default business config ─────────────────────────────
const DEFAULT_BUSINESS_CONFIG: BusinessConfig = {
  name: "My Trophy Shop",
  location: "Sydney NSW",
  region: "Inner West",
  seoTemplates: {
    metaTitle: "{keywords} {region} | {productName}",
    metaDescription:
      "{description} Prepared locally in {location} for {region} {keywords}.",
  },
};

const VERSION = "0.1.0";

// ── App ─────────────────────────────────────────────────
export function App(): React.ReactElement {
  const { exit } = useApp();

  // Core state
  const [screen, setScreen] = useState<Screen>("welcome");
  const [client, setClient] = useState<Client | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Workflow-derived state
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>({
    phase: "analyzing",
  });
  const [progress, setProgress] = useState<WorkflowProgress>({
    phase: "",
    current: 0,
    total: 0,
    percentage: 0,
  });
  const [suggestedConfig, setSuggestedConfig] = useState<SiteConfig | null>(
    null,
  );
  const [products, setProducts] = useState<GroupedProduct[]>([]);
  const [enrichedProducts, setEnrichedProducts] = useState<EnrichedProduct[]>(
    [],
  );
  const [scrapeErrors, setScrapeErrors] = useState<ScrapeError[]>([]);
  const [exportFilePath, setExportFilePath] = useState("");
  const [exportRowCount, setExportRowCount] = useState(0);

  // Connect to Temporal on mount
  const clientRef = useRef<Client | null>(null);

  useEffect(() => {
    let cancelled = false;
    createTemporalClient()
      .then((c) => {
        if (cancelled) {
          c.connection.close();
          return;
        }
        clientRef.current = c;
        setClient(c);
        setIsConnected(true);
      })
      .catch(() => {
        if (!cancelled) setIsConnected(false);
      });
    return () => {
      cancelled = true;
      clientRef.current?.connection.close();
    };
  }, []);

  // Global quit handler
  useInput((input) => {
    if (input === "q" && (screen === "export" || screen === "welcome")) {
      exit();
    }
  });

  // Start workflow
  const startWorkflow = useCallback(
    async (supplierUrl: string) => {
      if (!client) return;
      setUrl(supplierUrl);
      setScreen("analyzing");

      const wfId = `colorgirl-${Date.now()}`;
      const input: ScrapeWorkflowInput = {
        url: supplierUrl,
        businessConfig: DEFAULT_BUSINESS_CONFIG,
      };

      try {
        await client.workflow.start("scrapeWorkflow", {
          taskQueue: TASK_QUEUE,
          workflowId: wfId,
          args: [input],
        });
        setWorkflowId(wfId);
      } catch (err) {
        setErrorMsg(String(err));
        setScreen("welcome");
      }
    },
    [client],
  );

  // Poll workflow state
  useEffect(() => {
    if (!workflowId || !client) return;

    const handle = client.workflow.getHandle(workflowId);
    let polling = false;
    const interval = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const status = await handle.query<WorkflowStatus>(getStatusQuery);
        setWorkflowStatus(status);

        const prog = await handle.query<WorkflowProgress>(getProgressQuery);
        setProgress(prog);

        const errors = await handle.query<ScrapeError[]>(getScrapeErrorsQuery);
        setScrapeErrors(errors);

        // Phase-based screen transitions
        switch (status.phase) {
          case "analyzing":
            setScreen("analyzing");
            break;

          case "awaiting-config": {
            const config =
              await handle.query<SiteConfig | null>(getSuggestedConfigQuery);
            if (config) setSuggestedConfig(config);
            setScreen("config");
            break;
          }

          case "scraping": {
            const prods =
              await handle.query<GroupedProduct[]>(getProductsQuery);
            setProducts(prods);
            setScreen("scraping");
            break;
          }

          case "awaiting-products": {
            const prods =
              await handle.query<GroupedProduct[]>(getProductsQuery);
            setProducts(prods);
            setScreen("product-review");
            break;
          }

          case "enriching":
            setScreen("enriching");
            break;

          case "awaiting-export": {
            const preview =
              await handle.query<EnrichedProduct[]>(getPreviewQuery);
            setEnrichedProducts(preview);
            setScreen("preview");
            break;
          }

          case "exporting":
            // Stay on preview while exporting
            break;

          case "complete":
            setExportFilePath(status.message?.match(/to (.+)$/)?.[1] ?? "");
            setExportRowCount(
              Number(status.message?.match(/(\d+) rows/)?.[1] ?? 0),
            );
            setScreen("export");
            break;

          case "error":
            setErrorMsg(status.message ?? "Unknown error");
            break;
        }
      } catch {
        // Query may fail transiently during workflow transitions
      } finally {
        polling = false;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [workflowId, client]);

  // Signal handlers
  const handleConfigApprove = useCallback(
    async (config: SiteConfig, _bizConfig: BusinessConfig) => {
      if (!workflowId || !client) return;
      const handle = client.workflow.getHandle(workflowId);
      await handle.signal(configApprovedSignal, config);
    },
    [workflowId, client],
  );

  const handleProductsApprove = useCallback(
    async (selectedSkus: string[]) => {
      if (!workflowId || !client) return;
      const handle = client.workflow.getHandle(workflowId);
      await handle.signal(productsApprovedSignal, selectedSkus);
    },
    [workflowId, client],
  );

  const handleExportApprove = useCallback(async () => {
    if (!workflowId || !client) return;
    const handle = client.workflow.getHandle(workflowId);
    await handle.signal(exportApprovedSignal);
  }, [workflowId, client]);

  // Derive enrichment phase from workflow status
  const enrichmentPhase: "descriptions" | "seo" =
    workflowStatus.message?.includes("SEO") ? "seo" : "descriptions";

  // ── Screen router ─────────────────────────────────────
  switch (screen) {
    case "welcome":
      return (
        <WelcomeScreen
          version={VERSION}
          isConnected={isConnected}
          onContinue={() => setScreen("url-input")}
        />
      );

    case "url-input":
      return <UrlInputScreen onSubmit={startWorkflow} />;

    case "analyzing":
      return (
        <AnalysisScreen
          url={url}
          status={workflowStatus.message ?? ""}
        />
      );

    case "config":
      return suggestedConfig ? (
        <ConfigScreen
          config={suggestedConfig}
          businessConfig={DEFAULT_BUSINESS_CONFIG}
          onApprove={handleConfigApprove}
        />
      ) : (
        <AnalysisScreen url={url} status="Loading configuration..." />
      );

    case "scraping":
      return (
        <ScrapeProgressScreen
          progress={progress}
          productCount={products.length}
          errors={scrapeErrors}
        />
      );

    case "product-review":
      return (
        <ProductReviewScreen
          products={products}
          onApprove={handleProductsApprove}
        />
      );

    case "enriching":
      return (
        <EnrichmentScreen progress={progress} phase={enrichmentPhase} />
      );

    case "preview":
      return (
        <PreviewScreen
          products={enrichedProducts}
          onApprove={handleExportApprove}
        />
      );

    case "export":
      return (
        <ExportScreen
          filePath={exportFilePath}
          rowCount={exportRowCount}
          productCount={enrichedProducts.length}
        />
      );
  }
}

// ── CLI entry point ─────────────────────────────────────
export function main(): void {
  render(<App />);
}

// Direct execution
main();
