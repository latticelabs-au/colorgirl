import { useState, useCallback } from "react";
import { useApp, useInput } from "ink";
import type { Client } from "@temporalio/client";
import type { Screen } from "../app.js";

/**
 * Handle Escape with a double-press confirmation during active workflows.
 * On WelcomeScreen/ExportScreen/ErrorScreen, exits immediately.
 * During active work, first press shows a warning; second press disconnects
 * and prints a resume command (does NOT cancel the workflow).
 */
export function useGracefulShutdown(
  client: Client | null,
  workflowId: string | null,
  screen: Screen,
): { pendingExit: boolean } {
  const { exit } = useApp();
  const [pendingExit, setPendingExit] = useState(false);

  const doExit = useCallback(() => {
    if (workflowId) {
      // Print resume command to stderr so it survives Ink's cleanup
      process.stderr.write(
        `\nWorkflow still running. Resume with:\n  ./colorgirl --resume ${workflowId}\n\n`,
      );
    }
    exit();
  }, [workflowId, exit]);

  useInput((_input, key) => {
    if (key.escape) {
      const safeScreens: Screen[] = ["welcome", "export", "error"];
      if (safeScreens.includes(screen)) {
        exit();
        return;
      }
      if (pendingExit) {
        doExit();
      } else {
        setPendingExit(true);
        setTimeout(() => setPendingExit(false), 3000);
      }
    }
  });

  return { pendingExit };
}
