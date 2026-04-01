import React from "react";
import { Box, Text } from "ink";
import { ProgressBar, StatusBar } from "../components/index.js";
import { theme } from "../theme.js";
import type { WorkflowProgress } from "../../temporal/workflows/index.js";
import type { ScrapeError } from "../../scraper/engine.js";

interface ScrapeProgressScreenProps {
  progress: WorkflowProgress;
  productCount: number;
  errors: ScrapeError[];
}

export function ScrapeProgressScreen({
  progress,
  productCount,
  errors,
}: ScrapeProgressScreenProps): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color={theme.accent}>
        Scraping Products
      </Text>

      <StatusBar
        phase="Scraping"
        message={`Category ${progress.current} of ${progress.total}`}
      />

      <ProgressBar
        value={progress.percentage}
        label="Overall"
      />

      <Box>
        <Text color={theme.textDim}>Products found: </Text>
        <Text color={theme.text}>{productCount}</Text>
      </Box>

      {errors.length > 0 && (
        <Box>
          <Text color={theme.error}>
            Errors: {errors.length}
          </Text>
        </Box>
      )}
    </Box>
  );
}
