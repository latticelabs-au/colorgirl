/**
 * Type declarations for the @anthropic-ai/claude-code SDK.
 *
 * The package is primarily a CLI tool and does not ship type declarations.
 * This ambient module declaration covers the query() function used by our
 * agent executor.
 */

declare module "@anthropic-ai/claude-agent-sdk" {
  export interface QueryOptions {
    /** Model identifier (e.g. "claude-opus-4-6", "claude-sonnet-4-6") */
    model: string;
    /** System prompt */
    systemPrompt: string;
    /** User prompt */
    prompt: string;
    /** Maximum tokens in the response */
    maxTokens?: number;
    /** Tools the agent is allowed to use (empty = text-only) */
    allowedTools?: string[];
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
