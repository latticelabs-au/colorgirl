import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { Spinner } from "../components/index.js";
import { theme } from "../theme.js";

interface AnalysisScreenProps {
  url: string;
  status: string;
  logs?: string[];
}

export function AnalysisScreen({
  url,
  status,
  logs = [],
}: AnalysisScreenProps): React.ReactElement {
  const recentLogs = logs.slice(-10);

  // Elapsed timer
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color={theme.accent}>
        Site Analysis
      </Text>
      <Spinner label={`Analysing ${url}...`} />
      <Text color={theme.textDim}>
        Elapsed: {timeStr} — typically 2-8 min (Opus is browsing the site)
      </Text>
      {status && <Text color={theme.textDim}>{status}</Text>}
      {recentLogs.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {recentLogs.map((line, i) => (
            <Text key={i} color={theme.textDim} dimColor>
              {line}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
