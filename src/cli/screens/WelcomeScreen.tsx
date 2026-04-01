import React from "react";
import { Box, Text, useInput } from "ink";
import { Header, StatusBar, KeyHint } from "../components/index.js";
import { theme } from "../theme.js";

interface WelcomeScreenProps {
  version: string;
  isConnected: boolean;
  onContinue: () => void;
}

export function WelcomeScreen({
  version,
  isConnected,
  onContinue,
}: WelcomeScreenProps): React.ReactElement {
  useInput((_input, key) => {
    if (key.return) {
      onContinue();
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Header version={version} />
      <StatusBar
        phase="Welcome"
        message="AI-powered product scraper"
        isConnected={isConnected}
      />
      <Text color={theme.textDim}>
        Temporal: {isConnected ? "Connected" : "Disconnected"}
      </Text>
      <Box marginTop={1}>
        <Text color={theme.text}>Press Enter to begin</Text>
      </Box>
      <KeyHint hints={[{ key: "Enter", action: "Begin" }]} />
    </Box>
  );
}
