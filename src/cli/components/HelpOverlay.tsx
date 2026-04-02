import React from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";
import { HELP_CONTENT } from "../help-content.js";
import type { Screen } from "../app.js";

interface HelpOverlayProps {
  screen: Screen;
  onDismiss: () => void;
}

export function HelpOverlay({
  screen,
  onDismiss,
}: HelpOverlayProps): React.ReactElement {
  useInput((input, key) => {
    if (input === "?" || key.escape) {
      onDismiss();
    }
  });

  const help = HELP_CONTENT[screen];

  return (
    <Box flexDirection="column" gap={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.info}
        paddingX={2}
        paddingY={1}
      >
        <Text bold color={theme.info}>
          Help: {help.title}
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {help.lines.map((line, i) => (
            <Text key={i} color={line === "" ? undefined : theme.text}>
              {line || " "}
            </Text>
          ))}
        </Box>
      </Box>
      <Text color={theme.textDim}>Press ? or Esc to close</Text>
    </Box>
  );
}
