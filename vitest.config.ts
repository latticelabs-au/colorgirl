import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      // Alias the agent SDK to a stub so Vite can resolve the import
      // before vi.mock() replaces it in tests.
      "@anthropic-ai/claude-agent-sdk": resolve(
        rootDir,
        "src/agents/__tests__/_claude-code-stub.ts",
      ),
    },
  },
});
