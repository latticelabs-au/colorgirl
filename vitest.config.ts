import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      // The @anthropic-ai/claude-code package is a CLI tool with no proper
      // module entry point. Alias it to a stub so Vite can resolve the import
      // before vi.mock() replaces it in tests.
      "@anthropic-ai/claude-code": resolve(
        __dirname,
        "src/agents/__tests__/_claude-code-stub.ts",
      ),
    },
  },
});
