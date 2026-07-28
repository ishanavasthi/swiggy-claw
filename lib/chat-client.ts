import type { AgentMode, ChatMessage, SSEEvent } from "@/types/agent";

export interface StreamChatOptions {
  /** UI surface the user is on — steers tool selection server-side. */
  mode?: AgentMode;
  signal?: AbortSignal;
}

export interface StreamChatResult {
  /** The server rejected the request with 401 — the Swiggy session is gone. */
  unauthenticated: boolean;
  /** An error event was emitted (transport or agent-side). */
  errored: boolean;
}

// POST to the streaming agent endpoint and dispatch parsed SSE events.
export async function streamChat(
  userMessage: string,
  messages: ChatMessage[],
  onEvent: (e: SSEEvent) => void,
  options: StreamChatOptions = {}
): Promise<StreamChatResult> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessage, messages, mode: options.mode }),
      signal: options.signal,
    });
  } catch (err) {
    onEvent({ type: "error", payload: err instanceof Error ? err.message : "Network error" });
    return { unauthenticated: false, errored: true };
  }

  if (res.status === 401) {
    onEvent({ type: "error", payload: "Swiggy session expired — reconnect to continue." });
    return { unauthenticated: true, errored: true };
  }
  if (!res.ok || !res.body) {
    onEvent({ type: "error", payload: `Request failed (${res.status})` });
    return { unauthenticated: false, errored: true };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let errored = false;

  const emit = (e: SSEEvent) => {
    if (e.type === "error") errored = true;
    onEvent(e);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const lineRaw of frame.split("\n")) {
          if (!lineRaw.startsWith("data:")) continue;
          const data = lineRaw.slice(5).trim();
          if (!data) continue;
          try {
            emit(JSON.parse(data) as SSEEvent);
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    }
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "AbortError")) {
      emit({ type: "error", payload: err instanceof Error ? err.message : "Stream interrupted" });
    }
  }

  return { unauthenticated: false, errored };
}
