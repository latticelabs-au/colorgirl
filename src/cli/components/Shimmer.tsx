import React, { useState, useEffect } from "react";
import { Text } from "ink";
import { theme } from "../theme.js";

interface ShimmerProps {
  text: string;
  color?: string;
  shimmerColor?: string;
}

const SHIMMER_WIDTH = 3;
const TICK_MS = 150;

/**
 * Text with a bright "window" that sweeps left→right across the string.
 * Used on spinner labels to make waiting feel alive.
 */
export function Shimmer({
  text,
  color = theme.textDim,
  shimmerColor = theme.accentBright,
}: ShimmerProps): React.ReactElement {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const len = text.length;
  const cycle = len + SHIMMER_WIDTH + 4; // extra padding before restart
  const pos = tick % cycle;

  const chars = [...text];

  return (
    <Text>
      {chars.map((ch, i) => {
        const inShimmer = i >= pos && i < pos + SHIMMER_WIDTH;
        return (
          <Text key={i} color={inShimmer ? shimmerColor : color}>
            {ch}
          </Text>
        );
      })}
    </Text>
  );
}
