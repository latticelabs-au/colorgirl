import React from "react";
import { Text, Box } from "ink";
import { theme } from "../theme.js";

interface Column {
  key: string;
  header: string;
  width?: number;
  align?: "left" | "right" | "center";
}

interface TableProps {
  columns: Column[];
  data: Record<string, string | number>[];
  maxRows?: number;
}

function pad(text: string, width: number, align: "left" | "right" | "center" = "left"): string {
  if (text.length >= width) {
    return text.slice(0, width - 3) + "...";
  }
  const gap = width - text.length;
  if (align === "right") return " ".repeat(gap) + text;
  if (align === "center") {
    const left = Math.floor(gap / 2);
    return " ".repeat(left) + text + " ".repeat(gap - left);
  }
  return text + " ".repeat(gap);
}

export function Table({ columns, data, maxRows }: TableProps): React.ReactElement {
  const rows = maxRows !== undefined ? data.slice(0, maxRows) : data;
  const colWidths = columns.map((c) => c.width ?? Math.max(c.header.length, 10));

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        {columns.map((col, i) => (
          <Text key={col.key} bold color={theme.accent}>
            {pad(col.header, colWidths[i]!, col.align)}{i < columns.length - 1 ? "  " : ""}
          </Text>
        ))}
      </Box>

      {/* Separator */}
      <Box>
        <Text color={theme.border}>
          {columns.map((_, i) => "─".repeat(colWidths[i]!)).join("──")}
        </Text>
      </Box>

      {/* Rows */}
      {rows.map((row, rowIdx) => (
        <Box key={rowIdx}>
          {columns.map((col, i) => (
            <Text
              key={col.key}
              color={rowIdx % 2 === 0 ? theme.text : theme.textDim}
            >
              {pad(String(row[col.key] ?? ""), colWidths[i]!, col.align)}{i < columns.length - 1 ? "  " : ""}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}
