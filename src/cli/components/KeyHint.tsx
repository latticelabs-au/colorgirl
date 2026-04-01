import React from "react";
import { Text, Box } from "ink";
import { theme } from "../theme.js";

interface KeyHintProps {
  hints: Array<{ key: string; action: string }>;
}

export function KeyHint({ hints }: KeyHintProps): React.ReactElement {
  return (
    <Box gap={2}>
      {hints.map((hint) => (
        <Box key={hint.key}>
          <Text color={theme.accent}>{hint.key}</Text>
          <Text color={theme.textDim}> {hint.action}</Text>
        </Box>
      ))}
    </Box>
  );
}
