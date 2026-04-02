import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { RainbowText } from "./RainbowText.js";
import { theme } from "../theme.js";
import type { WorkflowStatus } from "../../temporal/workflows/index.js";

interface StepProgressProps {
  currentPhase: WorkflowStatus["phase"];
}

const STEPS: Array<{ label: string; phases: WorkflowStatus["phase"][] }> = [
  { label: "Analysis", phases: ["analyzing"] },
  { label: "Config", phases: ["awaiting-config"] },
  { label: "Scraping", phases: ["scraping"] },
  { label: "Products", phases: ["awaiting-products"] },
  { label: "Enrichment", phases: ["enriching"] },
  { label: "Preview", phases: ["awaiting-export", "exporting"] },
  { label: "Export", phases: ["complete"] },
];

function stepStatus(
  stepIdx: number,
  currentIdx: number,
  isError: boolean,
): { icon: string; color: string } {
  if (isError) {
    // On error, mark the last active step with ✗, completed before it with ✓
    if (currentIdx >= 0) {
      if (stepIdx < currentIdx) return { icon: "✓", color: theme.success };
      if (stepIdx === currentIdx) return { icon: "✗", color: theme.error };
    }
    return { icon: "○", color: theme.textDim };
  }
  if (stepIdx < currentIdx) return { icon: "✓", color: theme.success };
  if (stepIdx === currentIdx) return { icon: "●", color: theme.accent };
  return { icon: "○", color: theme.textDim };
}

export function StepProgress({
  currentPhase,
}: StepProgressProps): React.ReactElement {
  const isError = currentPhase === "error";
  const currentIdx = STEPS.findIndex((s) => s.phases.includes(currentPhase));

  // Pulse the active step indicator between accent and accentBright
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setPulse((p) => !p), 500);
    return () => clearInterval(t);
  }, []);

  return (
    <Box gap={1}>
      <RainbowText text="ColorGirl" bold />
      <Text color={theme.border}>|</Text>
      {STEPS.map((step, idx) => {
        const { icon, color } = stepStatus(idx, currentIdx, isError);
        const isActive = idx === currentIdx && !isError;
        return (
          <Box key={step.label}>
            <Text color={isActive ? (pulse ? theme.accentBright : theme.accent) : color}>
              {icon} {step.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
