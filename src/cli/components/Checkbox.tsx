import React from "react";
import { Text } from "ink";
import { theme } from "../theme.js";

interface CheckboxProps {
  label: string;
  checked: boolean;
  focused?: boolean;
}

export function Checkbox({
  label,
  checked,
  focused,
}: CheckboxProps): React.ReactElement {
  return (
    <Text
      underline={focused}
      color={focused ? theme.accent : undefined}
    >
      <Text color={checked ? theme.accent : theme.textDim}>
        {checked ? "[✓]" : "[ ]"}
      </Text>
      <Text> {label}</Text>
    </Text>
  );
}
