import React from "react";
import { Box, Text, useInput } from "ink";
import { KeyHint, RainbowText } from "../components/index.js";
import { useTerminalWidth } from "../hooks/index.js";
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
    if (key.return) onContinue();
  });

  const columns = useTerminalWidth();
  const wide = columns >= 60;
  const temporal = connectIcon(isConnected);
  const claude = connectIcon(isClaudeConnected);
  const logoLines = LOGO.split("\n").filter((l) => l.length > 0);

  return (
    <Box flexDirection="column" gap={1}>
      {/* Logo or compact header */}
      {wide ? (
        <Box flexDirection="column">
          {logoLines.map((line, i) => (
            <Text key={i} color={LOGO_COLORS[i % LOGO_COLORS.length]}>
              {line}
            </Text>
          ))}
        </Box>
      ) : (
        <RainbowText text="ColorGirl" bold />
      )}

      {/* Version + tagline */}
      <Box>
        <Text color={theme.accentLight}>v{version}</Text>
        <Text color={theme.textDim}> — AI-powered product scraper</Text>
      </Box>

      {/* Mascot + services side by side if wide, stacked if narrow */}
      <Box flexDirection={wide ? "row" : "column"} gap={wide ? 4 : 1}>
        {wide && (
          <Box flexDirection="column" flexShrink={0}>
            {MASCOT.map((line, i) => (
              <Text key={i} color={theme.accent}>{line}</Text>
            ))}
          </Box>
        )}

        <Box flexDirection="column">
          <Text color={theme.accentLight} bold>Services</Text>
          <Text>
            <Text color={temporal.color}>{temporal.icon} </Text>
            <Text color={theme.textDim}>Temporal  </Text>
            <Text color={temporal.color}>{isConnected ? "Connected" : "Disconnected"}</Text>
          </Text>
          <Text>
            <Text color={claude.color}>{claude.icon} </Text>
            <Text color={theme.textDim}>Claude    </Text>
            <Text color={claude.color}>
              {isClaudeConnected === null ? "Checking..." : isClaudeConnected ? "Connected" : "Disconnected"}
            </Text>
          </Text>
        </Box>
      </Box>

      {isClaudeConnected === false && (
        <Text color={theme.warning}>
          Run &apos;claude&apos; to re-auth, or pass ANTHROPIC_API_KEY
        </Text>
      )}

      <Box>
        <Text color={theme.accent}>Press </Text>
        <Text bold color={theme.accentBright}>Enter</Text>
        <Text color={theme.accent}> to start scraping</Text>
      </Box>

      <KeyHint hints={[
        { key: "Enter", action: "Begin" },
        { key: "q", action: "Quit" },
        { key: "?", action: "Help" },
      ]} />
    </Box>
  );
}
