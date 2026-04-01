/**
 * Stub module for @anthropic-ai/claude-code.
 *
 * The real package is a CLI tool with no proper ESM/CJS entry point, so Vite
 * cannot resolve it. This stub provides the query() export shape so that
 * vi.mock() can intercept it in tests.
 *
 * This file is ONLY used during testing via the Vitest alias in vitest.config.ts.
 * Production code imports the real package at runtime (Node.js resolves it fine
 * without Vite's module resolution).
 */

export async function* query(
  _options: Record<string, unknown>,
): AsyncGenerator<Record<string, unknown>> {
  // Stub — replaced by vi.mock() in tests
  yield {};
}
