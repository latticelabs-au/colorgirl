import React from "react";
import { Box, Text } from "ink";
import { KeyHint } from "../components/index.js";
import { theme } from "../theme.js";

interface ExportScreenProps {
  filePath: string;
  rowCount: number;
  productCount: number;
}

export function ExportScreen({
  filePath,
  rowCount,
  productCount,
}: ExportScreenProps): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color={theme.success}>
        Export Complete
      </Text>

      <Box>
        <Text color={theme.textDim}>File: </Text>
        <Text color={theme.text}>{filePath}</Text>
      </Box>

      <Box>
        <Text color={theme.textDim}>Rows: </Text>
        <Text color={theme.text}>{rowCount}</Text>
      </Box>

      <Box>
        <Text color={theme.textDim}>Products: </Text>
        <Text color={theme.text}>{productCount}</Text>
      </Box>

      <KeyHint hints={[{ key: "q", action: "Exit" }]} />
    </Box>
  );
}
