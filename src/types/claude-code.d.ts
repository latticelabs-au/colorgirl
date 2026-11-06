/**
 * Type declarations for the @anthropic-ai/claude-agent-sdk query() call.
 *
 * This ambient module declaration covers only the query() surface used by
 * our agent executor: query({ prompt, options }).
 */

declare module "@anthropic-ai/claude-agent-sdk" {
  export interface QueryRunOptions {
    /** Model identifier (e.g. "claude-opus-4-6", "claude-sonnet-4-6") */
    model?: string;
    /** System prompt */
    systemPrompt?: string;
    /** Maximum tokens in the response */
    maxTokens?: number;
    /** Maximum agentic turns */
    maxTurns?: number;
    /** Tools the agent is allowed to use (empty = text-only) */
    allowedTools?: string[];
    /** Permission mode for tool use */
    permissionMode?: string;
    /** Required alongside permissionMode "bypassPermissions" */
    allowDangerouslySkipPermissions?: boolean;
  }

  export interface QueryOptions {
    /** User prompt */
    prompt: string;
    /** Per-query options */
    options?: QueryRunOptions;
  }

  export interface ContentBlock {
    type: string;
    text?: string;
    [key: string]: unknown;
  }

  export interface MessageEvent {
    content?: ContentBlock[];
    usage?: {
      input_tokens: number;
      output_tokens: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }

  /**
   * Send a query to the Claude API and receive a stream of message events.
   * Returns an async iterable that yields MessageEvent objects.
   */
  export function query(options: QueryOptions): AsyncIterable<MessageEvent>;
}
