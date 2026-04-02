import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { KeyHint } from "../components/index.js";
import { theme } from "../theme.js";

interface UrlInputScreenProps {
  onSubmit: (url: string) => void;
}

function isValidUrl(url: string): boolean {
  return /^https?:\/\/.+/.test(url);
}

export function UrlInputScreen({
  onSubmit,
}: UrlInputScreenProps): React.ReactElement {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.return) {
      if (!isValidUrl(url)) {
        setError("Invalid URL. Must start with http:// or https://");
        return;
      }
      setError(null);
      onSubmit(url);
      return;
    }
    if (key.backspace || key.delete) {
      setUrl((prev) => prev.slice(0, -1));
      setError(null);
      return;
    }
    if (!key.ctrl && !key.meta && input) {
      setUrl((prev) => prev + input);
      setError(null);
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color={theme.accent}>
        Enter Supplier URL
      </Text>
      <Box>
        <Text color={theme.textDim}>URL: </Text>
        <Text color={theme.text}>{url}</Text>
        <Text color={theme.accent}>|</Text>
      </Box>
      {error && <Text color={theme.error}>{error}</Text>}
      <KeyHint
        hints={[
          { key: "Enter", action: "Submit" },
          { key: "Esc", action: "Back" },
          { key: "?", action: "Help" },
        ]}
      />
    </Box>
  );
}
