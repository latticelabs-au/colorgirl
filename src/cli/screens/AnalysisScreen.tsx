import React from "react";
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
  // Show last 10 log lines
  const recentLogs = logs.slice(-10);

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color={theme.accent}>
        Site Analysis
      </Text>
      <Spinner label={`Analysing ${url}...`} />
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
