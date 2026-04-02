import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { ProgressBar, StatusBar } from "../components/index.js";
import { theme } from "../theme.js";
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

  // ETA based on progress
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  let etaStr = "";
  if (progress.percentage > 5 && elapsed > 5) {
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
        <Box>
          <Text color={theme.error}>Errors: {errors.length}</Text>
        </Box>
      )}

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
