import { useEffect } from "react";
import { useStdout } from "ink";

/**
 * Clear the terminal when the window is resized.
 * Ink can't clean up stale lines from a previous render height,
 * so we force a full clear to avoid ghost output.
 */
export function useClearOnResize(): void {
  const { stdout } = useStdout();

  useEffect(() => {
    const onResize = () => {
      stdout.write("\x1b[2J\x1b[H");
    };
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
}
