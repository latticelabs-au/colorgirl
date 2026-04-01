import React from "react";
import { Text, Box } from "ink";
import { theme } from "../theme.js";

interface StatusBarProps {
  phase: string;
  message?: string;
  isConnected?: boolean;
}

export function StatusBar({
  phase,
  message,
  isConnected,
}: StatusBarProps): React.ReactElement {
  return (
    <Box>
      {isConnected !== undefined && (
        <Text color={isConnected ? theme.success : theme.error}>
          {isConnected ? "●" : "○"}{" "}
        </Text>
      )}
      <Text color={theme.textDim}>Phase: </Text>
      <Text color={theme.accent}>{phase}</Text>
      {message && <Text color={theme.textDim}> — {message}</Text>}
    </Box>
  );
}
