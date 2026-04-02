import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Table, Checkbox, KeyHint, StepProgress } from "../components/index.js";
import { theme } from "../theme.js";
import type { GroupedProduct } from "../../pipeline/models.js";

interface ProductReviewScreenProps {
  products: GroupedProduct[];
  onApprove: (selectedSkus: string[]) => void;
}

export function ProductReviewScreen({
  products,
  onApprove,
}: ProductReviewScreenProps): React.ReactElement {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(products.map((p) => p.parentSku)),
  );
  const [focusIndex, setFocusIndex] = useState(0);

  useInput((input, key) => {
    if (key.downArrow || input === "j") {
      setFocusIndex((i) => Math.min(i + 1, products.length - 1));
      return;
    }
    if (key.upArrow || input === "k") {
      setFocusIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (input === " ") {
      const product = products[focusIndex];
      if (product) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(product.parentSku)) next.delete(product.parentSku);
          else next.add(product.parentSku);
          return next;
        });
      }
      return;
    }
    if (input === "a") {
      if (selected.size === products.length) {
        setSelected(new Set());
      } else {
        setSelected(new Set(products.map((p) => p.parentSku)));
      }
      return;
    }
    if (key.return) {
      onApprove(Array.from(selected));
      return;
    }
  });

  // Build table data
  const tableData = products.map((p, idx) => ({
    sel: selected.has(p.parentSku) ? "[x]" : "[ ]",
    sku: p.parentSku,
    name: p.name,
    type: p.type,
    variants: String(p.variations.length),
    category: p.categoryPath.join(" > "),
    _focused: idx === focusIndex ? ">" : " ",
  }));

  const columns = [
    { key: "_focused", header: " ", width: 2 },
    { key: "sel", header: "", width: 4 },
    { key: "sku", header: "SKU", width: 18 },
    { key: "name", header: "Name", width: 30 },
    { key: "type", header: "Type", width: 10 },
    { key: "variants", header: "Vars", width: 6, align: "right" as const },
    { key: "category", header: "Categories", width: 25 },
  ];

  return (
    <Box flexDirection="column" gap={1}>
      <StepProgress currentPhase="awaiting-products" />
      <Text bold color={theme.accent}>
        Product Review
      </Text>

      <Box>
        <Text color={theme.textDim}>
          {selected.size} of {products.length} products selected
        </Text>
      </Box>

      <Table columns={columns} data={tableData} rowKey="sku" />

      <KeyHint
        hints={[
          { key: "\u2191/\u2193", action: "Navigate" },
          { key: "Space", action: "Toggle" },
          { key: "a", action: "Select All" },
          { key: "Enter", action: "Approve" },
        ]}
      />
    </Box>
  );
}
