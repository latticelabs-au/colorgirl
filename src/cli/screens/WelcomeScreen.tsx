import React from "react";
import { Box, Text, useInput } from "ink";
import { Header, StatusBar, KeyHint } from "../components/index.js";
import { theme } from "../theme.js";

interface WelcomeScreenProps {
  version: string;
  isConnected: boolean;
  isClaudeConnected: boolean | null;
  onContinue: () => void;
}

function connectIcon(status: boolean | null): { icon: string; color: string } {
  if (status === null) return { icon: "◌", color: theme.textDim };
  return status
    ? { icon: "●", color: theme.success }
    : { icon: "○", color: theme.error };
}

export function WelcomeScreen({
  version,
  isConnected,
  isClaudeConnected,
  onContinue,
}: WelcomeScreenProps): React.ReactElement {
  useInput((_input, key) => {
    if (key.return) {
      onContinue();
    }
  });

  const temporal = connectIcon(isConnected);
  const claude = connectIcon(isClaudeConnected);

  return (
    <Box flexDirection="column" gap={1}>
      <Header version={version} />
      <StatusBar
        phase="Welcome"
        message="AI-powered product scraper"
        isConnected={isConnected}
      />
      <Box flexDirection="column">
        <Text>
          <Text color={temporal.color}>{temporal.icon} </Text>
          <Text color={theme.textDim}>Temporal: </Text>
          <Text color={temporal.color}>{isConnected ? "Connected" : "Disconnected"}</Text>
        </Text>
        <Text>
          <Text color={claude.color}>{claude.icon} </Text>
          <Text color={theme.textDim}>Claude:   </Text>
          <Text color={claude.color}>
            {isClaudeConnected === null ? "Checking..." : isClaudeConnected ? "Connected" : "Disconnected"}
          </Text>
        </Text>
      </Box>
      {isClaudeConnected === false && (
        <Text color={theme.warning}>
          Run &apos;claude&apos; to re-authenticate, or pass ANTHROPIC_API_KEY
        </Text>
      )}
      <Box marginTop={1}>
        <Text color={theme.text}>Press Enter to begin</Text>
      </Box>
      <KeyHint hints={[{ key: "Enter", action: "Begin" }, { key: "q", action: "Quit" }]} />
    </Box>
  );
}
