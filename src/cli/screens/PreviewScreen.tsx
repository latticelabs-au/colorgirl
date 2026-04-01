import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { KeyHint } from "../components/index.js";
import { theme } from "../theme.js";
import type { EnrichedProduct } from "../../pipeline/models.js";

interface PreviewScreenProps {
  products: EnrichedProduct[];
  onApprove: () => void;
}

const PREVIEW_COUNT = 5;

export function PreviewScreen({
  products,
  onApprove,
}: PreviewScreenProps): React.ReactElement {
  const [scrollOffset, setScrollOffset] = useState(0);
  const preview = products.slice(0, PREVIEW_COUNT);
  const maxScroll = Math.max(0, preview.length - 1);

  useInput((input, key) => {
    if (key.downArrow) {
      setScrollOffset((i) => Math.min(i + 1, maxScroll));
      return;
    }
    if (key.upArrow) {
      setScrollOffset((i) => Math.max(i - 1, 0));
      return;
    }
    if (key.return) {
      onApprove();
      return;
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color={theme.accent}>
        Preview Enriched Products
      </Text>
      <Text color={theme.textDim}>
        Showing {preview.length} of {products.length} products
      </Text>

      {preview.map((product, idx) => (
        <Box
          key={product.parentSku}
          flexDirection="column"
          borderStyle="single"
          borderColor={idx === scrollOffset ? theme.accent : theme.border}
          paddingX={1}
        >
          <Text bold color={theme.text}>
            {product.name}
          </Text>
          <Box>
            <Text color={theme.textDim}>SKU: </Text>
            <Text color={theme.text}>{product.parentSku}</Text>
          </Box>
          <Box>
            <Text color={theme.textDim}>Short: </Text>
            <Text color={theme.text} wrap="truncate-end">
              {product.shortDescription}
            </Text>
          </Box>
          <Box>
            <Text color={theme.textDim}>Long: </Text>
            <Text color={theme.text} wrap="truncate-end">
              {product.longDescription.slice(0, 80)}
              {product.longDescription.length > 80 ? "..." : ""}
            </Text>
          </Box>
          <Box>
            <Text color={theme.textDim}>Title: </Text>
            <Text color={theme.text}>{product.metaTitle}</Text>
          </Box>
          <Box>
            <Text color={theme.textDim}>Permalink: </Text>
            <Text color={theme.text}>{product.permalink}</Text>
          </Box>
        </Box>
      ))}

      <KeyHint
        hints={[
          { key: "\u2191/\u2193", action: "Scroll" },
          { key: "Enter", action: "Export" },
          { key: "q", action: "Cancel" },
        ]}
      />
    </Box>
  );
}
