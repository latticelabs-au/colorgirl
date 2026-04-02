import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Checkbox, KeyHint, StatusBar, StepProgress, Panel } from "../components/index.js";
import { theme } from "../theme.js";
import type { SiteConfig, BusinessConfig } from "../../pipeline/models.js";

interface ConfigScreenProps {
  config: SiteConfig;
  businessConfig: BusinessConfig;
  onApprove: (config: SiteConfig, businessConfig: BusinessConfig) => void;
}

type Field = "name" | "location" | "region" | "categories" | "approve";

export function ConfigScreen({
  config,
  businessConfig,
  onApprove,
}: ConfigScreenProps): React.ReactElement {
  const [bizConfig, setBizConfig] = useState<BusinessConfig>({
    ...businessConfig,
  });
  const [focusedField, setFocusedField] = useState<Field>("name");
  const [editingField, setEditingField] = useState<Field | null>(null);

  // Derive categories from discovery config
  const allCategories =
    config.discovery.type === "category-list"
      ? config.discovery.sections.flatMap((s) => s.categories)
      : [];
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(allCategories),
  );
  const [categoryIndex, setCategoryIndex] = useState(0);

  const fields: Field[] = ["name", "location", "region"];
  if (allCategories.length > 0) fields.push("categories");
  fields.push("approve");

  useInput((input, key) => {
    // Handle field editing
    if (editingField && editingField !== "categories" && editingField !== "approve") {
      if (key.return || key.escape) {
        setEditingField(null);
        return;
      }
      if (key.backspace || key.delete) {
        setBizConfig((prev) => ({
          ...prev,
          [editingField]: prev[editingField as keyof Pick<BusinessConfig, "name" | "location" | "region">].slice(0, -1),
        }));
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        setBizConfig((prev) => ({
          ...prev,
          [editingField]: prev[editingField as keyof Pick<BusinessConfig, "name" | "location" | "region">] + input,
        }));
      }
      return;
    }

    // Navigate within categories with arrows (Tab to leave)
    if (focusedField === "categories" && (key.downArrow || key.upArrow)) {
      if (key.downArrow) {
        setCategoryIndex((i) => Math.min(i + 1, allCategories.length - 1));
      } else {
        setCategoryIndex((i) => Math.max(i - 1, 0));
      }
      return;
    }

    // Navigate fields — clear editing when moving away
    if (key.tab || key.downArrow) {
      setEditingField(null);
      const idx = fields.indexOf(focusedField);
      setFocusedField(fields[(idx + 1) % fields.length]!);
      return;
    }
    if (key.upArrow) {
      setEditingField(null);
      const idx = fields.indexOf(focusedField);
      setFocusedField(fields[(idx - 1 + fields.length) % fields.length]!);
      return;
    }

    // Enter to edit or approve
    if (key.return) {
      if (focusedField === "approve") {
        // Build final config with selected categories
        let finalConfig = config;
        if (config.discovery.type === "category-list" && allCategories.length > 0) {
          const filteredSections = config.discovery.sections.map((s) => ({
            ...s,
            categories: s.categories.filter((c) => selectedCategories.has(c)),
          }));
          finalConfig = {
            ...config,
            discovery: { ...config.discovery, sections: filteredSections },
          };
        }
        onApprove(finalConfig, bizConfig);
        return;
      }
      if (focusedField === "categories") {
        // Toggle category at categoryIndex
        const cat = allCategories[categoryIndex];
        if (cat !== undefined) {
          setSelectedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
          });
        }
        return;
      }
      setEditingField(focusedField);
      return;
    }

    // Space to toggle in category list
    if (input === " " && focusedField === "categories") {
      const cat = allCategories[categoryIndex];
      if (cat !== undefined) {
        setSelectedCategories((prev) => {
          const next = new Set(prev);
          if (next.has(cat)) next.delete(cat);
          else next.add(cat);
          return next;
        });
      }
      return;
    }

    // Select all / deselect all in category list
    if (focusedField === "categories" && (input === "a" || input === "A")) {
      setSelectedCategories((prev) =>
        prev.size === allCategories.length ? new Set() : new Set(allCategories),
      );
      return;
    }

    // Navigate categories sublist with j/k
    if (focusedField === "categories") {
      if (input === "j" || key.downArrow) {
        setCategoryIndex((i) => Math.min(i + 1, allCategories.length - 1));
      }
      if (input === "k" || key.upArrow) {
        setCategoryIndex((i) => Math.max(i - 1, 0));
      }
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <StepProgress currentPhase="awaiting-config" />
      <Text bold color={theme.accent}>
        Configuration Review
      </Text>

      <StatusBar phase="Config" message={`Site: ${config.name}`} />

      {/* Site config (read-only) */}
      <Panel title="Site Config">
        <Box>
          <Text color={theme.textDim}>Name: </Text>
          <Text color={theme.text}>{config.name}</Text>
        </Box>
        <Box>
          <Text color={theme.textDim}>URL:  </Text>
          <Text color={theme.text}>{config.baseUrl}</Text>
        </Box>
        <Box>
          <Text color={theme.textDim}>Discovery: </Text>
          <Text color={theme.text}>{config.discovery.type}</Text>
        </Box>
        <Box>
          <Text color={theme.textDim}>Variants:  </Text>
          <Text color={theme.text}>{config.variants.type}</Text>
        </Box>
        <Box>
          <Text color={theme.textDim}>Rate limit: </Text>
          <Text color={theme.text}>{config.rateLimit}ms</Text>
        </Box>
        {config.attributes.length > 0 && (
          <Box flexDirection="column">
            <Text color={theme.textDim}>Attributes:</Text>
            {config.attributes.map((attr) => (
              <Text key={attr.slug} color={theme.text}>
                {"  "}{attr.name} ({attr.slug}){attr.isVariation ? " [variation]" : ""}
              </Text>
            ))}
          </Box>
        )}
      </Panel>

      {/* Business config (editable) */}
      <Panel title="Business Config">
        <Box>
          <Text
            color={focusedField === "name" ? theme.accent : theme.textDim}
            underline={focusedField === "name"}
          >
            Business Name:{" "}
          </Text>
          <Text color={theme.text}>
            {bizConfig.name}
            {editingField === "name" ? "|" : ""}
          </Text>
        </Box>
        <Box>
          <Text
            color={focusedField === "location" ? theme.accent : theme.textDim}
            underline={focusedField === "location"}
          >
            Location:{" "}
          </Text>
          <Text color={theme.text}>
            {bizConfig.location}
            {editingField === "location" ? "|" : ""}
          </Text>
        </Box>
        <Box>
          <Text
            color={focusedField === "region" ? theme.accent : theme.textDim}
            underline={focusedField === "region"}
          >
            Region:{" "}
          </Text>
          <Text color={theme.text}>
            {bizConfig.region}
            {editingField === "region" ? "|" : ""}
          </Text>
        </Box>
      </Panel>

      {/* Category list — scrolling window */}
      {allCategories.length > 0 && (() => {
        const MAX_VISIBLE = 15;
        const total = allCategories.length;
        const half = Math.floor(MAX_VISIBLE / 2);
        let start = Math.max(0, categoryIndex - half);
        let end = start + MAX_VISIBLE;
        if (end > total) { end = total; start = Math.max(0, end - MAX_VISIBLE); }
        const visible = allCategories.slice(start, end);
        return (
          <Panel title={`Categories (${selectedCategories.size}/${total} selected, ${categoryIndex + 1}/${total})`}>
            {start > 0 && <Text color={theme.textDim}>  ↑ {start} more</Text>}
            {visible.map((cat, i) => (
              <Checkbox
                key={cat}
                label={cat}
                checked={selectedCategories.has(cat)}
                focused={focusedField === "categories" && (start + i) === categoryIndex}
              />
            ))}
            {end < total && <Text color={theme.textDim}>  ↓ {total - end} more</Text>}
          </Panel>
        );
      })()}

      {/* Approve button */}
      <Box marginTop={1}>
        <Text
          bold
          color={focusedField === "approve" ? theme.accent : theme.textDim}
          underline={focusedField === "approve"}
        >
          {">> Approve & Start Scraping <<"}
        </Text>
      </Box>

      <KeyHint
        hints={[
          { key: "Tab", action: "Switch field" },
          { key: "Space", action: "Toggle" },
          { key: "a", action: "Select/deselect all" },
          { key: "Enter", action: "Approve" },
          { key: "?", action: "Help" },
        ]}
      />
    </Box>
  );
}
