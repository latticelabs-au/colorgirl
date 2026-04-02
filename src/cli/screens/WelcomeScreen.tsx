import React from "react";
import { Box, Text, useInput } from "ink";
import { KeyHint } from "../components/index.js";
import { theme, LOGO, MASCOT } from "../theme.js";

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

const LOGO_COLORS = [
  theme.accentBright,
  theme.accent,
  theme.accent,
  theme.accentDim,
];

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
  const logoLines = LOGO.split("\n").filter((l) => l.length > 0);

  return (
    <Box flexDirection="column">
      {/* Main welcome box */}
      <Box
        flexDirection="row"
        borderStyle="round"
        borderColor={theme.accent}
        paddingX={2}
        paddingY={1}
        gap={4}
      >
        {/* Left: logo + version */}
        <Box flexDirection="column" alignItems="center">
          {logoLines.map((line, i) => (
            <Text key={i} color={LOGO_COLORS[i % LOGO_COLORS.length]}>
              {line}
            </Text>
          ))}
          <Text color={theme.accentLight}>v{version}</Text>
          <Box flexDirection="column" marginTop={1}>
            {MASCOT.map((line, i) => (
              <Text key={i} color={theme.accent}>
                {line}
              </Text>
            ))}
          </Box>
        </Box>

        {/* Right: status + info */}
        <Box flexDirection="column" gap={1}>
          <Text bold color={theme.text}>
            Welcome ✿
          </Text>
          <Text color={theme.textDim}>
            AI-powered product scraper → WooCommerce CSV
          </Text>

          <Box flexDirection="column" marginTop={1}>
            <Text color={theme.accentLight} bold>Services</Text>
            <Text>
              <Text color={temporal.color}>{temporal.icon} </Text>
              <Text color={theme.textDim}>Temporal  </Text>
              <Text color={temporal.color}>
                {isConnected ? "Connected" : "Disconnected"}
              </Text>
            </Text>
            <Text>
              <Text color={claude.color}>{claude.icon} </Text>
              <Text color={theme.textDim}>Claude    </Text>
              <Text color={claude.color}>
                {isClaudeConnected === null
                  ? "Checking..."
                  : isClaudeConnected
                    ? "Connected"
                    : "Disconnected"}
              </Text>
            </Text>
          </Box>

          {isClaudeConnected === false && (
            <Text color={theme.warning}>
              Run &apos;claude&apos; to re-auth, or pass ANTHROPIC_API_KEY
            </Text>
          )}

          <Box marginTop={1}>
            <Text color={theme.accent}>Press </Text>
            <Text bold color={theme.accentBright}>Enter</Text>
            <Text color={theme.accent}> to start scraping</Text>
          </Box>
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <KeyHint
          hints={[
            { key: "Enter", action: "Begin" },
            { key: "q", action: "Quit" },
            { key: "?", action: "Help" },
          ]}
        />
      </Box>
    </Box>
  );
}
