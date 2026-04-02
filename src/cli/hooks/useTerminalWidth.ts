import { useStdout } from "ink";

/** Get the current terminal width in columns. Falls back to 80. */
export function useTerminalWidth(): number {
  const { stdout } = useStdout();
  return stdout.columns ?? 80;
}
