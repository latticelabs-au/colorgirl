import { useState, useCallback } from "react";
import { useApp, useInput } from "ink";
import type { Client } from "@temporalio/client";
import type { Screen } from "../app.js";

/**
 * Handle Ctrl+C with a double-press confirmation during active workflows.
 * On WelcomeScreen/ExportScreen/ErrorScreen, exits immediately.
 * During active work, first press shows a warning; second press exits.
 */
export function useGracefulShutdown(
  client: Client | null,
  workflowId: string | null,
  screen: Screen,
): { pendingExit: boolean } {
  const { exit } = useApp();
  const [pendingExit, setPendingExit] = useState(false);

  const doExit = useCallback(() => {
    if (workflowId && client) {
      try {
        const handle = client.workflow.getHandle(workflowId);
        handle.cancel().catch(() => {});
      } catch {
        // Best-effort cancel
      }
    }
    exit();
  }, [client, workflowId, exit]);

  useInput((_input, key) => {
    // Ctrl+C is not directly catchable via useInput in Ink,
    // but Escape can serve as a soft-cancel mechanism
    if (key.escape) {
      const safeScreens: Screen[] = ["welcome", "export", "error"];
      if (safeScreens.includes(screen)) {
        doExit();
        return;
      }
      if (pendingExit) {
        doExit();
      } else {
        setPendingExit(true);
        // Reset after 3 seconds
        setTimeout(() => setPendingExit(false), 3000);
      }
    }
  });

  return { pendingExit };
}
