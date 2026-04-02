import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { Spinner, StepProgress, Shimmer } from "../components/index.js";
import { theme } from "../theme.js";
import { formatElapsed } from "../utils.js";

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

  const timeStr = formatElapsed(elapsed);

  return (
    <Box flexDirection="column" gap={1}>
      <StepProgress currentPhase="analyzing" />
      <Text bold color={theme.accent}>
        Site Analysis
      </Text>
      <Box>
        <Spinner label="" />
        <Text> </Text>
        <Shimmer text={`Analysing ${url}...`} />
      </Box>
      <Text color={theme.textDim}>
        Elapsed: {timeStr} — typically 2-8 min (Opus is browsing the site)
      </Text>
      {status && <Text color={theme.textDim}>{status}</Text>}
      {recentLogs.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {recentLogs.map((line, i) => (
            <Text key={i} color={theme.textDim}>
              {line}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
