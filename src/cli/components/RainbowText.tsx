import React from "react";
import { Text } from "ink";

const RAINBOW = [
  "#ff6b6b", // red
  "#ffa06b", // orange
  "#ffd56b", // yellow
  "#6bffa0", // green
  "#6bffff", // cyan
  "#6b9bff", // blue
  "#d46bff", // magenta
];

interface RainbowTextProps {
  text: string;
  bold?: boolean;
}

/** Render each character in a cycling rainbow hue. */
export function RainbowText({ text, bold }: RainbowTextProps): React.ReactElement {
  return (
    <Text>
      {[...text].map((ch, i) => (
        <Text key={i} color={RAINBOW[i % RAINBOW.length]} bold={bold}>
          {ch}
        </Text>
      ))}
    </Text>
  );
}
