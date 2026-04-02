/** ColorGirl brand accent: #a56571 */
export const theme = {
  accent: "#a56571",
  accentDim: "#7a4a54",
  accentLight: "#c98a94",
  accentBright: "#d4707e",
  text: "#e0e0e0",
  textDim: "#808080",
  info: "#5b9bd5",
  success: "#4caf50",
  warning: "#ff9800",
  error: "#f44336",
  bg: "",
  border: "#555555",
} as const;

export type Theme = typeof theme;

/** Return the theme colour appropriate for a given percentage. */
export function progressColor(percentage: number): string {
  if (percentage <= 33) return theme.error;
  if (percentage <= 66) return theme.warning;
  return theme.success;
}

/** Brand logo as ASCII art. */
export const LOGO = `
   ___      _          ___ _      _
  / __| ___| |___ _ _ / __(_)_ _| |
 | (__/ _ \\ / _ \\ '_| \\__ \\ | '_| |
  \\___\\___/_\\___/_|   |___/_|_| |_|
`;

/** Small mascot — a paint swatch with a face. 5 lines, plain ASCII. */
export const MASCOT = [
  "  .------.",
  "  | *  * |",
  "  |  <>  |",
  "  '------'",
  "    |  |",
];

