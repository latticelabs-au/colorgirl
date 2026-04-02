/** Format seconds into a human-readable elapsed string like "2m 15s" or "15s". */
export function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

/** Wrap text in an OSC 8 terminal hyperlink (clickable in supporting terminals). */
export function hyperlink(text: string, url: string): string {
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}
