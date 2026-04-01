import React from "react";
import { Text, Box } from "ink";
import { theme, LOGO } from "../theme.js";

interface HeaderProps {
  version?: string;
}

export function Header({ version }: HeaderProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>{LOGO}</Text>
      <Text color={theme.accent}>
        ColorGirl{version ? ` v${version}` : ""}
      </Text>
    </Box>
  );
}
