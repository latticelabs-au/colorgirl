import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

interface PanelProps {
  title?: string;
  children: React.ReactNode;
  borderColor?: string;
}

export function Panel({
  title,
  children,
  borderColor = theme.border,
}: PanelProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {title && (
        <Text bold color={theme.accentLight}>
          {title}
        </Text>
      )}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={borderColor}
        paddingX={1}
      >
        {children}
      </Box>
    </Box>
  );
}
