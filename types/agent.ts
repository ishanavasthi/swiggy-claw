// Agent <-> UI contract.

export type SwiggyServer = "food" | "instamart" | "dineout";

/** Which Swiggy surface the user has the UI pointed at. Steers tool selection. */
export type AgentMode = "food" | "groceries" | "dineout";

export interface ToolCallRecord {
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
}

/**
 * API history. This is what gets POSTed to /api/chat and what
 * `buildHistoryFromMessages` consumes — keep it to flat text turns.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallRecord[];
  /** Client-only; ignored by the server. Used for the "Recent" list. */
  ts?: number;
}

// ---------------------------------------------------------------------------
// Render model
// ---------------------------------------------------------------------------

export type ToolStatus = "executing" | "resolved" | "error";

export interface TimelineMessage {
  kind: "message";
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Open bubble — still receiving deltas. Also drives the blinking cursor. */
  streaming?: boolean;
  /** Open bubble with no text yet — renders the skeleton. */
  loading?: boolean;
}

export interface TimelineTool {
  kind: "tool";
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
  status: ToolStatus;
  /** Extracted from a failed SwiggyToolResponse for the error rendering. */
  error?: string;
}

/**
 * Ordered render model for a conversation. Unlike `ChatMessage[]`, this
 * preserves the text → tool → text interleaving of a single agent turn.
 */
export type TimelineItem = TimelineMessage | TimelineTool;

// Events streamed from the orchestrator to the client over SSE.
export type SSEEvent =
  | { type: "text_delta"; payload: string }
  | { type: "tool_call"; payload: { id: string; name: string; args: unknown } }
  | { type: "tool_result"; payload: { id: string; name: string; result: unknown } }
  | { type: "notice"; payload: string } // non-fatal (e.g. rate-limit backoff)
  | { type: "done"; payload: null }
  | { type: "error"; payload: string };

/** One saved chat session. The live session is held directly on the store. */
export interface Conversation {
  id: string;
  /** Derived from the opening user message. */
  title: string;
  messages: ChatMessage[];
  timeline: TimelineItem[];
  updatedAt: number;
  /** Number of user turns — shown in the Recent list. */
  messageCount: number;
}
