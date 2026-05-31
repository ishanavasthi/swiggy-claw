"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/types/agent";
import { ToolCallCard } from "./ToolCallCard";

const markdownComponents = {
  table: (props: any) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: (props: any) => <th className="border px-2 py-1 text-left font-semibold" {...props} />,
  td: (props: any) => <td className="border px-2 py-1" {...props} />,
  code: (props: any) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...props} />,
  a: (props: any) => <a className="text-primary underline" {...props} />,
  ul: (props: any) => <ul className="my-1 list-disc pl-5" {...props} />,
  ol: (props: any) => <ol className="my-1 list-decimal pl-5" {...props} />,
};

export function MessageBubble({
  message,
  streaming = false,
}: {
  message: ChatMessage;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {!isUser && message.toolCalls?.length ? (
          <div className="mb-2 space-y-1.5">
            {message.toolCalls.map((rec) => (
              <ToolCallCard key={rec.id} rec={rec} />
            ))}
          </div>
        ) : null}

        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className="prose-sm break-words leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content || (streaming ? "…" : "")}
            </ReactMarkdown>
            {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-foreground/60 align-middle" />}
          </div>
        )}
      </div>
    </div>
  );
}
