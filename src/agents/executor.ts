/**
 * Shared SDK wrapper for all AI agents.
 * Uses the @anthropic-ai/claude-agent-sdk query() function to execute prompts
 * and collect streamed text responses.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

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
const VERBOSE = process.env.COLORGIRL_VERBOSE === "1";

function log(msg: string): void {
  if (VERBOSE) console.log(`[agent] ${msg}`);
}

export async function executeAgent(
  prompt: string,
  options: AgentOptions,
): Promise<AgentResponse> {
  const { model, systemPrompt, maxTokens = 4096 } = options;

  log(`Starting ${model} agent (maxTokens=${maxTokens})`);
  log(`Prompt: ${prompt.slice(0, 120)}...`);
  const startTime = Date.now();

  const response = query({
    model,
    systemPrompt,
    prompt,
    maxTokens,
    allowedTools: [],
  });

  const textParts: string[] = [];
  let usage: AgentResponse["usage"] | undefined;
  let eventCount = 0;

  for await (const event of response) {
    eventCount++;
    if (event && typeof event === "object") {
      const msg = event as Record<string, unknown>;

      // Log event types for debugging
      if (VERBOSE && msg.type) {
        log(`Event #${eventCount}: type=${msg.type as string}`);
      }

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
            log(`Received ${(block.text as string).length} chars of text`);
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

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalChars = textParts.join("").length;
  log(`Completed in ${elapsed}s — ${totalChars} chars, ${eventCount} events`);
  if (usage) {
    log(`Tokens: ${usage.inputTokens} in / ${usage.outputTokens} out`);
  }

  return {
    text: textParts.join(""),
    usage,
  };
}

// ---------------------------------------------------------------------------
// parseJsonResponse
// ---------------------------------------------------------------------------

/**
 * Strip markdown fences and parse a JSON string returned by an agent.
 *
 * Handles responses wrapped in ```json ... ``` code fences, which models
 * sometimes produce despite being told not to.
 *
 * @throws Error if the text is not valid JSON after stripping fences
 */
export function parseJsonResponse<T>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned) as T;
}
