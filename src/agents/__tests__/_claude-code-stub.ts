/**
 * Test stub for @anthropic-ai/claude-agent-sdk.
 *
 * The real package resolves under Vite and Node (its exports map points at
 * sdk.mjs), so this stub is not a resolution workaround. The Vitest alias in
 * vitest.config.ts points the import here to keep tests hermetic: a test that
 * forgets vi.mock() gets this inert query() instead of the real SDK, which
 * would spawn the Claude Code CLI. Tests replace it with vi.mock().
 *
 * This file is ONLY used during testing. Production code imports the real
 * package, and tsc type-checks against the types it ships.
 */

export async function* query(
  _options: Record<string, unknown>,
): AsyncGenerator<Record<string, unknown>> {
  // Stub — replaced by vi.mock() in tests
  yield {};
}
