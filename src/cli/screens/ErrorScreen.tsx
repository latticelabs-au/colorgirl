import React from "react";
import { Box, Text, useInput } from "ink";
import { KeyHint } from "../components/index.js";
import { theme } from "../theme.js";
import type { AppError } from "../types.js";

interface ErrorScreenProps {
  error: AppError;
  onRestart: () => void;
  onQuit: () => void;
}

const VERBOSE = process.env.COLORGIRL_VERBOSE === "1";

export function ErrorScreen({
  error,
  onRestart,
  onQuit,
}: ErrorScreenProps): React.ReactElement {
  useInput((input) => {
    if (input === "r") onRestart();
    if (input === "q") onQuit();
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.error}
        paddingX={2}
        paddingY={1}
      >
        <Text bold color={theme.error}>
          Error: {error.code}
        </Text>
        <Box marginTop={1}>
          <Text color={theme.text}>{error.message}</Text>
        </Box>
        {error.detail && error.detail !== error.message && (
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.textDim}>Detail:</Text>
            <Text color={theme.textDim}>{error.detail}</Text>
          </Box>
        )}
      </Box>

      <Box flexDirection="column" paddingX={1}>
        <Text bold color={theme.warning}>
          Suggestion:
        </Text>
        {error.suggestion.split("\n").map((line, i) => (
          <Text key={i} color={theme.text}>
            {line}
          </Text>
        ))}
      </Box>

      <KeyHint
        hints={[
          { key: "r", action: "Restart" },
          { key: "q", action: "Quit" },
        ]}
      />
    </Box>
  );
}
