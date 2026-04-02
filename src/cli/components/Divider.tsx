import React from "react";
import { Text } from "ink";
import { theme } from "../theme.js";

interface DividerProps {
  label?: string;
  width?: number;
}

export function Divider({ label, width = 50 }: DividerProps): React.ReactElement {
  if (!label) {
    return <Text color={theme.border}>{"─".repeat(width)}</Text>;
  }
  const labelStr = ` ${label} `;
  const sideLen = Math.max(2, Math.floor((width - labelStr.length) / 2));
  return (
    <Text>
      <Text color={theme.border}>{"─".repeat(sideLen)}</Text>
      <Text color={theme.accentLight}>{labelStr}</Text>
      <Text color={theme.border}>{"─".repeat(sideLen)}</Text>
    </Text>
  );
}
