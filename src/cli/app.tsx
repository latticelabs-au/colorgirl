#!/usr/bin/env node
import React, { useState, useEffect, useCallback, useRef } from "react";
import { render, useApp, useInput, Box, Text } from "ink";
import { execFile } from "node:child_process";
import { Client } from "@temporalio/client";
import { createTemporalClient, TASK_QUEUE } from "../temporal/client.js";
import {
  getStatusQuery,
  getProductsQuery,
  getProgressQuery,
  getPreviewQuery,
  getSuggestedConfigQuery,
  getScrapeErrorsQuery,
  getLogsQuery,
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
import type { AppError } from "./types.js";
import { toAppError } from "./errors.js";
import { theme } from "./theme.js";
import { useClearOnResize, useGracefulShutdown } from "./hooks/index.js";

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
  ErrorScreen,
} from "./screens/index.js";
import { HelpOverlay } from "./components/index.js";

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
  | "export"
  | "error";

// ── Default business config ─────────────────────────────
const DEFAULT_BUSINESS_CONFIG: BusinessConfig = {
  name: "",
  location: "",
  region: "",
  seoTemplates: {
    metaTitle: "{keywords} {region} | {productName}",
    metaDescription:
      "{description} Prepared locally in {location} for {region} {keywords}.",
  },
};

const VERSION = "1.2.3";

// ── App ─────────────────────────────────────────────────
interface AppProps {
  initialUrl?: string;
  resumeWorkflowId?: string;
}

export function App({ initialUrl, resumeWorkflowId }: AppProps = {}): React.ReactElement {
  const { exit } = useApp();

  // Core state
  const [screen, setScreen] = useState<Screen>("welcome");
  const [client, setClient] = useState<Client | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isClaudeConnected, setIsClaudeConnected] = useState<boolean | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [appError, setAppError] = useState<AppError | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Clear terminal on resize to avoid ghost output
  useClearOnResize();

  // Graceful shutdown (Esc key with double-press confirmation)
  const { pendingExit } = useGracefulShutdown(client, workflowId, screen);

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
  const [logs, setLogs] = useState<string[]>([]);
  const [exportFilePath, setExportFilePath] = useState("");
  const [exportRowCount, setExportRowCount] = useState(0);

  // Connect to Temporal on mount
  const clientRef = useRef<Client | null>(null);
  const suggestedConfigRef = useRef<SiteConfig | null>(null);
  const lastPhaseRef = useRef<string>("");

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
      .catch((err) => {
        if (!cancelled) {
          setIsConnected(false);
          setAppError(toAppError(err, "temporal-connection"));
        }
      });
    return () => {
      cancelled = true;
      clientRef.current?.connection.close();
    };
  }, []);

  // Check Claude connectivity on mount
  useEffect(() => {
    // Use SDK's bundled CLI — no global claude binary in container
    execFile("node", ["node_modules/@anthropic-ai/claude-agent-sdk/cli.js", "--print", "ping"], { timeout: 15000 }, (err, stdout) => {
      if (err) {
        setIsClaudeConnected(false);
      } else {
        setIsClaudeConnected(stdout.trim().length > 0);
      }
    });
  }, []);

  // Global quit + help handler
  useInput((input) => {
    if (input === "q" && (screen === "export" || screen === "welcome" || screen === "error")) {
      exit();
    }
    if (input === "?" && !showHelp) {
      setShowHelp(true);
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
        setAppError(toAppError(err, "workflow-start"));
        setScreen("error");
      }
    },
    [client],
  );

  // Resume existing workflow if --resume flag provided
  useEffect(() => {
    if (resumeWorkflowId && client && !workflowId) {
      setWorkflowId(resumeWorkflowId);
      setScreen("analyzing");
    }
  }, [resumeWorkflowId, client, workflowId]);

  // Auto-start with URL if provided as CLI arg
  useEffect(() => {
    if (initialUrl && client && !workflowId && !resumeWorkflowId) {
      startWorkflow(initialUrl);
    }
  }, [initialUrl, client, workflowId, resumeWorkflowId, startWorkflow]);

  // Poll workflow state
  useEffect(() => {
    if (!workflowId || !client) return;

    const handle = client.workflow.getHandle(workflowId);
    let polling = false;
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;

    const interval = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const status = await handle.query<WorkflowStatus>(getStatusQuery);
        consecutiveFailures = 0;

        const phaseChanged = status.phase !== lastPhaseRef.current;
        lastPhaseRef.current = status.phase;

        // Only update progress/logs during active phases (not waiting for user input)
        const activePhases = ["analyzing", "scraping", "enriching", "exporting"];
        if (activePhases.includes(status.phase)) {
          setWorkflowStatus(status);

          const prog = await handle.query<WorkflowProgress>(getProgressQuery);
          setProgress(prog);

          const errors = await handle.query<ScrapeError[]>(getScrapeErrorsQuery);
          setScrapeErrors(errors);

          const workflowLogs = await handle.query<string[]>(getLogsQuery);
          setLogs(workflowLogs);
        }

        // Only transition screen when phase changes
        if (!phaseChanged) {
          // Still fetch products during scraping (count updates)
          if (status.phase === "scraping") {
            const prods = await handle.query<GroupedProduct[]>(getProductsQuery);
            setProducts(prods);
          }
        } else {
          // Phase-based screen transitions
          switch (status.phase) {
            case "analyzing":
              setScreen("analyzing");
              break;

            case "awaiting-config": {
              if (!suggestedConfigRef.current) {
                const config =
                  await handle.query<SiteConfig | null>(getSuggestedConfigQuery);
                if (config) {
                  suggestedConfigRef.current = config;
                  setSuggestedConfig(config);
                }
              }
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
              setAppError(toAppError(status.message ?? "Unknown error", "workflow-error"));
              setScreen("error");
              break;
          }
        }
      } catch (err) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          setAppError(toAppError(err, "query-failed"));
          setScreen("error");
        }
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

  // ── Pending exit warning ──────────────────────────────
  if (pendingExit) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color={theme.warning}>Press Esc again to quit (workflow keeps running — use --resume to reconnect)</Text>
      </Box>
    );
  }

  // ── Help overlay ──────────────────────────────────────
  if (showHelp) {
    return <HelpOverlay screen={screen} onDismiss={() => setShowHelp(false)} />;
  }

  // ── Screen router ─────────────────────────────────────
  switch (screen) {
    case "welcome":
      if ((initialUrl || resumeWorkflowId) && client) {
        return <AnalysisScreen url={initialUrl ?? ""} status={resumeWorkflowId ? "Reconnecting..." : "Starting..."} />;
      }
      return (
        <WelcomeScreen
          version={VERSION}
          isConnected={isConnected}
          isClaudeConnected={isClaudeConnected}
          client={client}
          onContinue={() => setScreen("url-input")}
          onResume={(wfId) => {
            setWorkflowId(wfId);
            setScreen("analyzing");
          }}
        />
      );

    case "url-input":
      return <UrlInputScreen onSubmit={startWorkflow} />;

    case "analyzing":
      return (
        <AnalysisScreen
          url={url}
          status={workflowStatus.message ?? ""}
          logs={logs}
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
          logs={logs}
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
        <EnrichmentScreen progress={progress} logs={logs} />
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

    case "error":
      return (
        <ErrorScreen
          error={appError ?? { code: "UNKNOWN", message: "Unknown error", suggestion: "Try restarting." }}
          onRestart={() => {
            setAppError(null);
            setWorkflowId(null);
            setScreen("welcome");
          }}
          onQuit={() => exit()}
        />
      );
  }
}

// ── CLI entry point ─────────────────────────────────────
import { ErrorBoundary } from "./components/index.js";
import { parseCliArgs, printHelp, printVersion } from "./args.js";

export function main(): void {
  const args = parseCliArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (args.version) {
    printVersion();
    process.exit(0);
  }
  if (args.noColor || process.env.NO_COLOR) {
    process.env.FORCE_COLOR = "0";
  }

  render(
    <ErrorBoundary>
      <App
        initialUrl={args.url ?? undefined}
        resumeWorkflowId={args.resume ?? undefined}
      />
    </ErrorBoundary>,
  );
}

// Direct execution
main();
