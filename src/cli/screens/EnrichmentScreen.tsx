import React from "react";
import { Box, Text } from "ink";
import { ProgressBar, Spinner, StatusBar, StepProgress } from "../components/index.js";
import { theme } from "../theme.js";
import { useEta } from "../hooks/index.js";
import type { WorkflowProgress } from "../../temporal/workflows/index.js";

interface EnrichmentScreenProps {
  progress: WorkflowProgress;
  logs?: string[];
}

export function EnrichmentScreen({
  progress,
  logs = [],
}: EnrichmentScreenProps): React.ReactElement {
  const recentLogs = logs.slice(-8);
  const { elapsedStr, etaStr } = useEta(progress.percentage);

  return (
    <Box flexDirection="column" gap={1}>
      <StepProgress currentPhase="enriching" />
      <Text bold color={theme.accent}>
        AI Enrichment
      </Text>

      <StatusBar phase="Enriching" message="Generating descriptions + SEO" />

      <Spinner label="Generating descriptions + SEO..." />

      <ProgressBar
        value={progress.percentage}
        label={`Batch ${progress.current} of ${progress.total}`}
      />

      <Box gap={2}>
        <Text color={theme.textDim}>Models: <Text color={theme.text}>Haiku + Sonnet</Text></Text>
        <Text color={theme.textDim}>Elapsed: {elapsedStr}</Text>
        {etaStr && <Text color={theme.textDim}>{etaStr}</Text>}
      </Box>

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
