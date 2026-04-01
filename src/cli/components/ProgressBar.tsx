import React from "react";
import { Text, Box } from "ink";
import { theme, progressColor } from "../theme.js";

interface ProgressBarProps {
  value: number;
  width?: number;
  label?: string;
}

export function ProgressBar({
  value,
  width = 40,
  label,
}: ProgressBarProps): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, value));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;

  return (
    <Box>
      {label && (
        <Text color={theme.text}>{label} </Text>
      )}
      <Text color={theme.accent}>{"█".repeat(filled)}</Text>
      <Text color={theme.border}>{"░".repeat(empty)}</Text>
      <Text color={progressColor(clamped)}> {Math.round(clamped)}%</Text>
    </Box>
  );
}
