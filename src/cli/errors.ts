import type { AppError, AppErrorCode } from "./types.js";

/**
 * Map a raw error and context string into a structured AppError
 * with a human-readable suggestion for the user.
 */
export function toAppError(error: unknown, context: string): AppError {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  // Temporal connection errors
  if (
    context === "temporal-connection" ||
    lower.includes("econnrefused") ||
    lower.includes("failed to connect")
  ) {
    return {
      code: "TEMPORAL_CONNECTION",
      message: "Cannot connect to Temporal server",
      detail: raw,
      suggestion:
        "Is Docker running? Try: ./colorgirl --verbose\n" +
        "Check logs: docker compose -f docker/docker-compose.yml logs temporal",
    };
  }

  // Auth / Claude errors
  if (
    lower.includes("authentication") ||
    lower.includes("401") ||
    lower.includes("unauthorized") ||
    lower.includes("expired")
  ) {
    return {
      code: "CLAUDE_CONNECTION",
      message: "Claude API authentication failed",
      detail: raw,
      suggestion:
        "Re-run 'claude' to refresh credentials, then restart ./colorgirl\n" +
        "Or pass an API key: ANTHROPIC_API_KEY=sk-ant-... ./colorgirl",
    };
  }

  // Workflow start errors
  if (context === "workflow-start") {
    return {
      code: "WORKFLOW_START",
      message: "Failed to start workflow",
      detail: raw,
      suggestion:
        "Check that the worker is running:\n" +
        "  docker compose -f docker/docker-compose.yml logs colorgirl-worker",
    };
  }

  // Timeout errors
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return {
      code: "WORKFLOW_TIMEOUT",
      message: "Workflow timed out waiting for approval",
      detail: raw,
      suggestion: "The workflow waited too long for a response. Restart and try again.",
    };
  }

  // Query failures (polling)
  if (context === "query-failed") {
    return {
      code: "QUERY_FAILED",
      message: "Lost connection to workflow",
      detail: raw,
      suggestion:
        "The workflow may have crashed. Check worker logs:\n" +
        "  docker compose -f docker/docker-compose.yml logs --tail 30 colorgirl-worker",
    };
  }

  // Signal failures
  if (context === "signal-failed") {
    return {
      code: "SIGNAL_FAILED",
      message: "Failed to send approval to workflow",
      detail: raw,
      suggestion: "The workflow may have completed or timed out. Try restarting.",
    };
  }

  // Workflow error phase
  if (context === "workflow-error") {
    return {
      code: "WORKFLOW_FAILED",
      message: raw || "Workflow failed",
      detail: raw,
      suggestion:
        "Logs saved to output/<workflow-id>.log\n" +
        "Docker logs: docker compose -f docker/docker-compose.yml logs --tail 30 colorgirl-worker",
    };
  }

  // Fallback
  return {
    code: "UNKNOWN",
    message: raw || "An unexpected error occurred",
    detail: raw,
    suggestion: "Try restarting: ./colorgirl --verbose",
  };
}
