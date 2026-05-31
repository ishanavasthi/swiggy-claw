import type { ChatMessage, SSEEvent } from "@/types/agent";

// POST to the streaming agent endpoint and dispatch parsed SSE events.
export async function streamChat(
  userMessage: string,
  messages: ChatMessage[],
  onEvent: (e: SSEEvent) => void
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessage, messages }),
    });
  } catch (err) {
    onEvent({ type: "error", payload: err instanceof Error ? err.message : "Network error" });
    return;
  }

  if (res.status === 401) {
    onEvent({ type: "error", payload: "Swiggy session expired — reconnect to continue." });
    return;
  }
  if (!res.ok || !res.body) {
    onEvent({ type: "error", payload: `Request failed (${res.status})` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
          onEvent(JSON.parse(data) as SSEEvent);
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  }
}
