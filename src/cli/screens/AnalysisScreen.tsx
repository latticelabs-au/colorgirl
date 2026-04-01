import React from "react";
import { Box, Text } from "ink";
import { Spinner } from "../components/index.js";
import { theme } from "../theme.js";

interface AnalysisScreenProps {
  url: string;
  status: string;
}

export function AnalysisScreen({
  url,
  status,
}: AnalysisScreenProps): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color={theme.accent}>
        Site Analysis
      </Text>
      <Spinner label={`Analysing ${url}...`} />
      {status && <Text color={theme.textDim}>{status}</Text>}
    </Box>
  );
}
