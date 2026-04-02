import React from "react";
import { Text, Box } from "ink";
import { theme, LOGO } from "../theme.js";

interface HeaderProps {
  version?: string;
}

const LOGO_COLORS = [
  theme.accentBright,
  theme.accent,
  theme.accent,
  theme.accentDim,
];

export function Header({ version }: HeaderProps): React.ReactElement {
  const lines = LOGO.split("\n").filter((l) => l.length > 0);
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} color={LOGO_COLORS[i % LOGO_COLORS.length]}>
          {line}
        </Text>
      ))}
      <Text color={theme.accent}>
        ColorGirl{version ? ` v${version}` : ""}
      </Text>
    </Box>
  );
}
