// Groq tool loop as a single streaming call per round. Corrects the spec's bugs:
//  - yields happen in the generator body (never inside Promise.all(map(async)))
//  - tool_calls are accumulated by index across delta chunks, parsed once per round
//  - empty/blank arguments default to {} (no JSON.parse("") crash)
//  - the streamed assistant text is stored verbatim, so history == what the user saw
//  - assistant/tool messages stay 1:1 paired; round count is capped

import Groq from "groq-sdk";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "groq-sdk/resources/chat/completions";
import type { ChatMessage, SSEEvent } from "@/types/agent";
import { withRetry } from "@/lib/swiggy/retry";
import type { CallMCPTool } from "./guards";

const MAX_ROUNDS = 8;

interface AccumulatedCall {
  id: string;
  name: string;
  args: string;
}

function safeParseArgs(raw: string): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function buildHistoryFromMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  // Carry only finalized text turns across requests — no dangling tool_calls to pair.
  return messages
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam);
}

export async function* runAgentStream(
  userMessage: string,
  history: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
  callMCPTool: CallMCPTool,
  systemPrompt: string
): AsyncGenerator<SSEEvent> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const model = process.env.GROQ_MODEL_TOOLS ?? "llama-3.3-70b-versatile";

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const forceText = round === MAX_ROUNDS - 1;

    let stream;
    try {
      stream = await withRetry(() =>
        groq.chat.completions.create({
          model,
          messages,
          tools,
          tool_choice: forceText ? "none" : "auto",
          max_tokens: 4096,
          stream: true,
        })
      );
    } catch (err) {
      yield { type: "error", payload: err instanceof Error ? err.message : String(err) };
      return;
    }

    const calls = new Map<number, AccumulatedCall>();
    let text = "";
    let finish: string | null = null;

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        finish = choice.finish_reason ?? finish;
        const delta = choice.delta;
        if (delta?.content) {
          text += delta.content;
          yield { type: "text_delta", payload: delta.content };
        }
        for (const tc of delta?.tool_calls ?? []) {
          const idx = tc.index ?? 0;
          const e = calls.get(idx) ?? { id: "", name: "", args: "" };
          if (tc.id) e.id = tc.id;
          if (tc.function?.name) e.name = tc.function.name;
          if (tc.function?.arguments) e.args += tc.function.arguments;
          calls.set(idx, e);
        }
      }
    } catch (err) {
      yield { type: "error", payload: err instanceof Error ? err.message : String(err) };
      return;
    }

    if (finish !== "tool_calls" || calls.size === 0) {
      yield { type: "done", payload: null };
      return;
    }

    const ordered = [...calls.values()].filter((c) => c.name);

    // Append the assistant turn with its tool_calls (content may be empty).
    messages.push({
      role: "assistant",
      content: text || null,
      tool_calls: ordered.map((e) => ({
        id: e.id,
        type: "function",
        function: { name: e.name, arguments: e.args || "{}" },
      })),
    });

    // Execute serially so yields stay in generator scope and events stay ordered.
    for (const e of ordered) {
      const args = safeParseArgs(e.args);
      yield { type: "tool_call", payload: { id: e.id, name: e.name, args } };

      let result: unknown;
      try {
        result = await callMCPTool(e.name, args);
      } catch (err) {
        result = { success: false, error: { message: err instanceof Error ? err.message : String(err) } };
      }

      yield { type: "tool_result", payload: { id: e.id, name: e.name, result } };
      messages.push({ role: "tool", tool_call_id: e.id, content: JSON.stringify(result) });
    }
  }

  // Exhausted MAX_ROUNDS without a text finish.
  yield { type: "done", payload: null };
}
