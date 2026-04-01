import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Checkbox, KeyHint, StatusBar } from "../components/index.js";
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

    // Navigate fields
    if (key.tab || key.downArrow) {
      const idx = fields.indexOf(focusedField);
      setFocusedField(fields[(idx + 1) % fields.length]!);
      return;
    }
    if (key.upArrow) {
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
      <Text bold color={theme.accent}>
        Configuration Review
      </Text>

      <StatusBar phase="Config" message={`Site: ${config.name}`} />

      {/* Site config (read-only) */}
      <Box flexDirection="column">
        <Text color={theme.textDim}>Site Name: </Text>
        <Text color={theme.text}>{config.name}</Text>
      </Box>
      <Box flexDirection="column">
        <Text color={theme.textDim}>Base URL: </Text>
        <Text color={theme.text}>{config.baseUrl}</Text>
      </Box>
      <Box>
        <Text color={theme.textDim}>Discovery: </Text>
        <Text color={theme.text}>{config.discovery.type}</Text>
      </Box>
      <Box>
        <Text color={theme.textDim}>Variants: </Text>
        <Text color={theme.text}>{config.variants.type}</Text>
      </Box>
      <Box>
        <Text color={theme.textDim}>Rate limit: </Text>
        <Text color={theme.text}>{config.rateLimit}ms</Text>
      </Box>

      {/* Attributes */}
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

      {/* Business config (editable) */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold color={theme.accent}>
          Business Config
        </Text>
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
      </Box>

      {/* Category list */}
      {allCategories.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text
            bold
            color={focusedField === "categories" ? theme.accent : theme.textDim}
          >
            Categories ({selectedCategories.size}/{allCategories.length})
          </Text>
          {allCategories.map((cat, idx) => (
            <Checkbox
              key={cat}
              label={cat}
              checked={selectedCategories.has(cat)}
              focused={focusedField === "categories" && idx === categoryIndex}
            />
          ))}
        </Box>
      )}

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
          { key: "Enter", action: "Approve" },
        ]}
      />
    </Box>
  );
}
