import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * React error boundary that catches rendering crashes.
 * Last-resort fallback — shows the raw error in the terminal.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <Box flexDirection="column" gap={1} paddingX={1}>
          <Text bold color={theme.error}>
            ColorGirl crashed
          </Text>
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor={theme.error}
            paddingX={2}
            paddingY={1}
          >
            <Text color={theme.text}>{this.state.error.message}</Text>
            {this.state.error.stack && (
              <Box marginTop={1}>
                <Text color={theme.textDim}>
                  {this.state.error.stack.split("\n").slice(1, 5).join("\n")}
                </Text>
              </Box>
            )}
          </Box>
          <Text color={theme.textDim}>
            Please report this issue. Press Ctrl+C to exit.
          </Text>
        </Box>
      );
    }
    return this.props.children;
  }
}
