/**
 * Shared SDK wrapper for all AI agents.
 * Uses the @anthropic-ai/claude-code SDK query() function to execute prompts
 * and collect streamed text responses.
 */

import { query } from "@anthropic-ai/claude-code";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentOptions {
  /** Model to use (e.g. "claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001") */
  model: string;
  /** System prompt providing agent context and instructions */
  systemPrompt: string;
  /** Max tokens for the response (default: 4096) */
  maxTokens?: number;
}

export interface AgentResponse {
  /** The collected text response from the agent */
  text: string;
  /** Token usage statistics, if available */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ---------------------------------------------------------------------------
// executeAgent
// ---------------------------------------------------------------------------

/**
 * Execute a Claude agent query with streaming.
 *
 * Calls the SDK query() function which returns an async iterable of message
 * events. We iterate through all events, collecting text content blocks into
 * a single response string.
 *
 * The query() API yields message objects with varying shapes. We look for
 * objects containing a `type` of "result" with content blocks, or objects
 * that carry a `text` field directly.
 */
export async function executeAgent(
  prompt: string,
  options: AgentOptions,
): Promise<AgentResponse> {
  const { model, systemPrompt, maxTokens = 4096 } = options;

  const messages: Array<{ role: "user"; content: string }> = [
    { role: "user", content: prompt },
  ];

  const response = query({
    model,
    systemPrompt,
    prompt,
    maxTokens,
    allowedTools: [],
  });

  const textParts: string[] = [];
  let usage: AgentResponse["usage"] | undefined;

  for await (const event of response) {
    // The SDK yields message events. Result messages contain content blocks
    // with the actual text. We also handle direct text fields for robustness.
    if (event && typeof event === "object") {
      const msg = event as Record<string, unknown>;

      // Handle result-type messages with content blocks
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (
            block &&
            typeof block === "object" &&
            "type" in block &&
            block.type === "text" &&
            "text" in block &&
            typeof block.text === "string"
          ) {
            textParts.push(block.text);
          }
        }
      }

      // Capture usage stats if present
      if (msg.usage && typeof msg.usage === "object") {
        const u = msg.usage as Record<string, unknown>;
        if (typeof u.input_tokens === "number" && typeof u.output_tokens === "number") {
          usage = {
            inputTokens: u.input_tokens,
            outputTokens: u.output_tokens,
          };
        }
      }
    }
  }

  return {
    text: textParts.join(""),
    usage,
  };
}
