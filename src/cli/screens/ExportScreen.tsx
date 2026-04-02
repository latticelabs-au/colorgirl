import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { KeyHint, StepProgress, Panel } from "../components/index.js";
import { theme } from "../theme.js";

interface ExportScreenProps {
  filePath: string;
  rowCount: number;
  productCount: number;
}

const HEARTS = [
  "    ♥        ♥    ",
  "  ♥    ♥   ♥   ♥  ",
  " ♥  ♥    ♥   ♥    ",
  "♥     ♥       ♥   ",
  ".   .     .    .   ",
];
const HEART_TICK_MS = 500;
const HEART_FRAMES = HEARTS.length;

export function ExportScreen({
  filePath,
  rowCount,
  productCount,
}: ExportScreenProps): React.ReactElement {
  const [heartFrame, setHeartFrame] = useState(0);

  useEffect(() => {
    if (heartFrame >= HEART_FRAMES) return;
    const t = setTimeout(() => setHeartFrame((f) => f + 1), HEART_TICK_MS);
    return () => clearTimeout(t);
  }, [heartFrame]);

  return (
    <Box flexDirection="column" gap={1}>
      <StepProgress currentPhase="complete" />

      {heartFrame < HEART_FRAMES && (
        <Text color={theme.accentBright}>{HEARTS[heartFrame]}</Text>
      )}

      <Text bold color={theme.success}>
        Export Complete
      </Text>

      <Panel title="Export Summary" borderColor={theme.success}>
        <Box>
          <Text color={theme.textDim}>File:     </Text>
          <Text color={theme.text}>{filePath}</Text>
        </Box>
        <Box>
          <Text color={theme.textDim}>Rows:     </Text>
          <Text color={theme.text}>{rowCount}</Text>
        </Box>
        <Box>
          <Text color={theme.textDim}>Products: </Text>
          <Text color={theme.text}>{productCount}</Text>
        </Box>
      </Panel>

      <KeyHint hints={[{ key: "q", action: "Exit" }, { key: "?", action: "Help" }]} />
    </Box>
  );
}
