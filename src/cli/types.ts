/** Error codes for structured TUI error handling. */
export type AppErrorCode =
  | "TEMPORAL_CONNECTION"
  | "CLAUDE_CONNECTION"
  | "WORKFLOW_START"
  | "WORKFLOW_TIMEOUT"
  | "WORKFLOW_FAILED"
  | "QUERY_FAILED"
  | "SIGNAL_FAILED"
  | "UNKNOWN";

/** Structured error with human-readable context and recovery suggestions. */
export interface AppError {
  code: AppErrorCode;
  message: string;
  detail?: string;
  suggestion: string;
}
