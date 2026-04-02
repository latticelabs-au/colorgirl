import React, { useState, useEffect, useRef } from "react";
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

  // ETA
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  let etaStr = "";
  if (progress.percentage > 5 && elapsed > 3) {
    const totalEstimate = (elapsed / progress.percentage) * 100;
    const remaining = Math.max(0, Math.round(totalEstimate - elapsed));
    const remMins = Math.floor(remaining / 60);
    const remSecs = remaining % 60;
    etaStr = remMins > 0 ? `~${remMins}m ${remSecs}s remaining` : `~${remSecs}s remaining`;
  }

  const elapsedMins = Math.floor(elapsed / 60);
  const elapsedSecs = elapsed % 60;
  const elapsedStr = elapsedMins > 0 ? `${elapsedMins}m ${elapsedSecs}s` : `${elapsedSecs}s`;

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

      <Box gap={2}>
        <Text color={theme.textDim}>Model: <Text color={theme.text}>{model}</Text></Text>
        <Text color={theme.textDim}>Elapsed: {elapsedStr}</Text>
        {etaStr && <Text color={theme.textDim}>{etaStr}</Text>}
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
