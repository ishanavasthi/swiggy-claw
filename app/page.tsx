"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useChatStore } from "@/store/chat";
import { streamChat } from "@/lib/chat-client";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { InputBar } from "@/components/chat/InputBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const {
    messages,
    isStreaming,
    hydrate,
    addUserMessage,
    beginAssistant,
    appendAssistantDelta,
    addToolCall,
    resolveToolCall,
    finaliseAssistantMessage,
    setStreaming,
    reset,
  } = useChatStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  async function send(text: string) {
    if (isStreaming) return;
    const history = useChatStore.getState().messages; // prior turns, excludes this user msg
    addUserMessage(text);
    beginAssistant();
    setStreaming(true);

    await streamChat(text, history, (e) => {
      switch (e.type) {
        case "text_delta":
          appendAssistantDelta(e.payload);
          break;
        case "tool_call":
          addToolCall(e.payload);
          break;
        case "tool_result":
          resolveToolCall(e.payload.id, e.payload.result);
          break;
        case "error":
          toast.error(e.payload);
          break;
        case "done":
          break;
      }
    });

    finaliseAssistantMessage();
    setStreaming(false);
  }

  const last = messages[messages.length - 1];
  const awaitingConfirm =
    !isStreaming &&
    last?.role === "assistant" &&
    /\b(yes\s*\/\s*no|confirm\??|shall i)\b/i.test(last.content);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <span className="text-lg font-semibold">🍴 Swiggy Claw</span>
        <Badge variant="outline">mock mode</Badge>
        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={reset} disabled={isStreaming}>
            New chat
          </Button>
        </div>
      </header>

      <ChatWindow />

      <div className="border-t px-4 py-3">
        <div className="mx-auto max-w-2xl space-y-2">
          {awaitingConfirm && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => send("yes")} disabled={isStreaming}>
                Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={() => send("no")} disabled={isStreaming}>
                Cancel
              </Button>
            </div>
          )}
          <InputBar disabled={isStreaming} onSend={send} />
        </div>
      </div>
    </div>
  );
}
