import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli/app.tsx", "src/temporal/worker.ts", "src/temporal/workflows/scrape-workflow.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: true,
  external: ["playwright"],
});
