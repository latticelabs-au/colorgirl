import React from "react";
import { Box, Text } from "ink";
import { ProgressBar, StatusBar, StepProgress } from "../components/index.js";
import { theme } from "../theme.js";
import { useEta } from "../hooks/index.js";
import type { WorkflowProgress } from "../../temporal/workflows/index.js";
import type { ScrapeError } from "../../scraper/engine.js";

interface ScrapeProgressScreenProps {
  progress: WorkflowProgress;
  productCount: number;
  errors: ScrapeError[];
  logs?: string[];
}

export function ScrapeProgressScreen({
  progress,
  productCount,
  errors,
  logs = [],
}: ScrapeProgressScreenProps): React.ReactElement {
  const recentLogs = logs.slice(-8);
  const { elapsedStr, etaStr } = useEta(progress.percentage);

  return (
    <Box flexDirection="column" gap={1}>
      <StepProgress currentPhase="scraping" />
      <Text bold color={theme.accent}>
        Scraping Products
      </Text>

      <StatusBar
        phase="Scraping"
        message={`Category ${progress.current} of ${progress.total}`}
      />

      <ProgressBar
        value={progress.percentage}
        label="Overall"
      />

      <Box gap={2}>
        <Text color={theme.textDim}>Products: <Text color={theme.text}>{productCount}</Text></Text>
        <Text color={theme.textDim}>Elapsed: {elapsedStr}</Text>
        {etaStr && <Text color={theme.textDim}>{etaStr}</Text>}
      </Box>

      {errors.length > 0 && (
        <Box flexDirection="column">
          <Text color={theme.error}>Errors: {errors.length}</Text>
          {errors.slice(-3).map((err, i) => (
            <Text key={i} color={theme.textDim}>
              {"  "}{err.url.slice(0, 60)}{err.url.length > 60 ? "..." : ""} — {err.error}
            </Text>
          ))}
        </Box>
      )}

      {recentLogs.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {recentLogs.map((line, i) => (
            <Text key={i} color={theme.textDim} dimColor={i < recentLogs.length - 3}>{line}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
