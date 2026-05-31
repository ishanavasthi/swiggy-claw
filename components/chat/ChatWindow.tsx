"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/store/chat";
import type { ChatMessage } from "@/types/agent";
import { MessageBubble } from "./MessageBubble";

export function ChatWindow() {
  const messages = useChatStore((s) => s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    anchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming]);

  const streamingMsg: ChatMessage | null = streaming
    ? { role: "assistant", content: streaming.content, toolCalls: streaming.toolCalls }
    : null;

  const empty = messages.length === 0 && !streamingMsg;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {empty && (
          <div className="mt-24 text-center text-muted-foreground">
            <p className="text-lg font-medium">Order food, buy groceries, or book a table - just ask.</p>
            <p className="mt-2 text-sm">Try: “Order one chicken biryani to my Home address.”</p>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {streamingMsg && <MessageBubble message={streamingMsg} streaming />}

        <div ref={anchorRef} />
      </div>
    </div>
  );
}
