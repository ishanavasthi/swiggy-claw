// Agent <-> UI contract.

export type SwiggyServer = "food" | "instamart" | "dineout";

export interface ToolCallRecord {
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallRecord[];
}

// Events streamed from the orchestrator to the client over SSE.
export type SSEEvent =
  | { type: "text_delta"; payload: string }
  | { type: "tool_call"; payload: { id: string; name: string; args: unknown } }
  | { type: "tool_result"; payload: { id: string; name: string; result: unknown } }
  | { type: "done"; payload: null }
  | { type: "error"; payload: string };
