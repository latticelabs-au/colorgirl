import React from "react";
import { Box, Text } from "ink";
import { ProgressBar, Spinner, StatusBar } from "../components/index.js";
import { theme } from "../theme.js";
import type { WorkflowProgress } from "../../temporal/workflows/index.js";

interface EnrichmentScreenProps {
  progress: WorkflowProgress;
  phase: "descriptions" | "seo";
  logs?: string[];
}

const PHASE_LABELS: Record<string, string> = {
  descriptions: "Generating descriptions",
  seo: "Generating SEO",
};

const PHASE_MODELS: Record<string, string> = {
  descriptions: "Haiku",
  seo: "Sonnet",
};

export function EnrichmentScreen({
  progress,
  phase,
  logs = [],
}: EnrichmentScreenProps): React.ReactElement {
  const label = PHASE_LABELS[phase] ?? phase;
  const model = PHASE_MODELS[phase] ?? "Unknown";
  const recentLogs = logs.slice(-8);

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color={theme.accent}>
        AI Enrichment
      </Text>

      <StatusBar phase="Enriching" message={label} />

      <Spinner label={`${label}...`} />

      <ProgressBar
        value={progress.percentage}
        label={`Batch ${progress.current} of ${progress.total}`}
      />

      <Box>
        <Text color={theme.textDim}>Model: </Text>
        <Text color={theme.text}>{model}</Text>
      </Box>

      {recentLogs.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {recentLogs.map((line, i) => (
            <Text key={i} color={theme.textDim} dimColor>{line}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
