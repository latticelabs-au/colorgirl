import React from "react";
import { Text } from "ink";
import InkSpinner from "ink-spinner";
import { theme } from "../theme.js";

interface SpinnerProps {
  label: string;
}

export function Spinner({ label }: SpinnerProps): React.ReactElement {
  return (
    <Text>
      <Text color={theme.accent}>
        <InkSpinner type="dots" />
      </Text>
      <Text> {label}</Text>
    </Text>
  );
}
