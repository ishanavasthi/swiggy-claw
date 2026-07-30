// Groq tool loop as a single streaming call per round. Corrects the spec's bugs:
//  - yields happen in the generator body (never inside Promise.all(map(async)))
//  - tool_calls are accumulated by index across delta chunks, parsed once per round
//  - empty/blank arguments default to {} (no JSON.parse("") crash)
//  - the streamed assistant text is stored verbatim, so history == what the user saw
//  - assistant/tool messages stay 1:1 paired; round count is capped

import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { createLLMClient, resolveModel } from "./provider";
import type { ChatMessage, SSEEvent } from "@/types/agent";
import { isRetryable, handle429, statusOf, sleep } from "@/lib/swiggy/retry";
import type { CallMCPTool } from "./guards";

const MAX_CREATE_ATTEMPTS = 4;
const MAX_429_WAIT_MS = 12000;

const MAX_ROUNDS = 8;
const MAX_UNKNOWN_STRIKES = 2;

function describeError(err: any): string {
  const fg = err?.error?.error?.failed_generation ?? err?.error?.failed_generation;
  const msg = err instanceof Error ? err.message : String(err);
  if (fg) return `${msg} :: failed_generation=${typeof fg === "string" ? fg : JSON.stringify(fg)}`;
  if (err?.error) return `${msg} :: ${JSON.stringify(err.error).slice(0, 800)}`;
  return msg;
}

interface AccumulatedCall {
  id: string;
  name: string;
  args: string;
}

/**
 * Strip model-format control tokens that some providers leak into the function
 * name. NVIDIA NIM serving `openai/gpt-oss-*` emits Harmony channel markers, so
 * the name arrives as `your_go_to_items<|channel|>commentary` and every lookup
 * misses. A few models also namespace the call as `functions.<name>`.
 *
 * Keeps the leading run of tool-name characters, which drops anything from the
 * first control token onward along with stray whitespace or newlines.
 */
export function sanitizeToolName(raw: string): string {
  const withoutNamespace = raw.trim().replace(/^functions[.:]/i, "");
  const match = withoutNamespace.match(/^[A-Za-z0-9_.-]+/);
  return match ? match[0] : "";
}

/** Names the model is actually allowed to call this turn. */
function validToolNames(tools: ChatCompletionTool[]): Set<string> {
  const names = new Set<string>();
  for (const t of tools) {
    if (t.type === "function" && t.function?.name) names.add(t.function.name);
  }
  return names;
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

/**
 * Cap on one serialized tool result carried back into history. Enough to keep
 * ids and a short list intact; bounded so a long catalogue can't dominate the
 * input budget once several turns have accumulated.
 */
const MAX_HISTORY_RESULT_CHARS = 800;

function compactResult(result: unknown): string {
  const raw = typeof result === "string" ? result : JSON.stringify(result ?? null);
  return raw.length > MAX_HISTORY_RESULT_CHARS
    ? `${raw.slice(0, MAX_HISTORY_RESULT_CHARS)}…[truncated]`
    : raw;
}

/**
 * Tools whose result is a snapshot of mutable server state rather than a durable
 * fact. An order confirmation stays true forever; a cart listing stops being
 * true the moment anything touches the cart — and checkout empties it outright.
 *
 * Replaying every old snapshot invites the model to merge them: asked to add
 * bread after a completed order, it reported the four items from the previous
 * cart plus the bread, when the live cart held only bread. So only the most
 * recent snapshot per tool keeps its payload.
 */
const SNAPSHOT_TOOLS = new Set([
  "get_cart",
  "get_food_cart",
  "update_cart",
  "update_food_cart",
  "clear_cart",
  "flush_food_cart",
  "apply_food_coupon",
]);

const SUPERSEDED = JSON.stringify({
  note: "Superseded — a later call to this tool returned the current state. Use that result, not this one.",
});

/**
 * Flat UI history -> provider messages, replaying each assistant turn's tool
 * calls alongside its text.
 *
 * Text alone is not enough state to continue a turn. A turn that resolved an
 * addressId, built a cart, or looked up spinIds leaves none of that in its prose,
 * so the next request would start blind: the model re-resolves the address,
 * re-asks a question it already asked, and — with nothing to bind a bare "yes"
 * to — eventually confabulates (up to and including claiming a tool it was
 * handed does not exist). Replaying the calls keeps the resolved facts on the
 * record.
 *
 * Pairing is safe by construction: the `tool_calls` array and its result
 * messages are emitted from the same filtered record list, so neither side can
 * dangle. Ids are re-scoped per history entry because providers reuse call ids
 * (`call_1`) across turns, and duplicates within one request are ambiguous.
 */
export function buildHistoryFromMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  // Only completed calls replay — one still awaiting a result would leave an
  // unanswered tool_call in the request.
  const completed = (m: ChatMessage, i: number) =>
    (m.toolCalls ?? [])
      .filter((c) => c.id && c.name && c.result !== undefined)
      .map((c) => ({ ...c, id: `h${i}_${c.id}` }));

  // Which occurrence of each snapshot tool is the live one. Everything earlier
  // is stale by the time this request runs.
  const liveSnapshot = new Map<string, string>();
  messages.forEach((m, i) => {
    if (m.role !== "assistant") return;
    for (const c of completed(m, i)) {
      if (SNAPSHOT_TOOLS.has(c.name)) liveSnapshot.set(c.name, c.id);
    }
  });

  const out: ChatCompletionMessageParam[] = [];

  messages.forEach((m, i) => {
    if (m.role === "user") {
      if (m.content?.trim()) out.push({ role: "user", content: m.content });
      return;
    }

    const calls = completed(m, i);

    if (calls.length) {
      out.push({
        role: "assistant",
        content: null,
        tool_calls: calls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
        })),
      });
      for (const c of calls) {
        const stale = SNAPSHOT_TOOLS.has(c.name) && liveSnapshot.get(c.name) !== c.id;
        out.push({
          role: "tool",
          tool_call_id: c.id,
          content: stale ? SUPERSEDED : compactResult(c.result),
        });
      }
    }

    if (m.content?.trim()) out.push({ role: "assistant", content: m.content });
  });

  return out;
}

export async function* runAgentStream(
  userMessage: string,
  history: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
  callMCPTool: CallMCPTool,
  systemPrompt: string
): AsyncGenerator<SSEEvent> {
  const llm = createLLMClient();
  const model = resolveModel();

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  const knownTools = validToolNames(tools);
  // A model that keeps emitting an unroutable tool name will otherwise burn
  // every remaining round on the same failure. After MAX_UNKNOWN_STRIKES we stop
  // offering tools and make it answer in text instead.
  let unknownStrikes = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const forceText = round === MAX_ROUNDS - 1 || unknownStrikes >= MAX_UNKNOWN_STRIKES;

    // Inline retry so we can yield a notice during 429 backoff (no silent hang).
    let stream: AsyncIterable<ChatCompletionChunk> | undefined;
    for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
      try {
        stream = (await llm.chat.completions.create({
          model,
          messages,
          tools,
          tool_choice: forceText ? "none" : "auto",
          temperature: 0.2, // low temp → reliable tool selection, fewer malformed tool calls
          max_tokens: 4096,
          stream: true,
        })) as unknown as AsyncIterable<ChatCompletionChunk>;
        break;
      } catch (err) {
        const last = attempt === MAX_CREATE_ATTEMPTS - 1;
        if (!isRetryable(err) || last) {
          yield { type: "error", payload: describeError(err) };
          return;
        }
        const waitMs =
          statusOf(err) === 429 ? Math.min(handle429(err), MAX_429_WAIT_MS) : 600 * (attempt + 1);
        yield { type: "notice", payload: `Rate limited — retrying in ${Math.ceil(waitMs / 1000)}s…` };
        await sleep(waitMs);
      }
    }
    if (!stream) {
      yield { type: "error", payload: "Failed to start completion stream." };
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
      yield { type: "error", payload: describeError(err) };
      return;
    }

    if (finish !== "tool_calls" || calls.size === 0) {
      yield { type: "done", payload: null };
      return;
    }

    // A missing id would collide in the UI timeline (cards are keyed by it) and
    // break tool-result pairing when the turn is replayed as history.
    const ordered = [...calls.values()]
      .map((c, i) => ({ ...c, id: c.id || `call_${round}_${i}`, name: sanitizeToolName(c.name) }))
      .filter((c) => c.name);

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
      if (!knownTools.has(e.name)) {
        // Don't hand a bogus name to the MCP router — tell the model plainly so
        // it can correct itself, and count the strike.
        unknownStrikes++;
        result = {
          success: false,
          error: {
            message: `Unknown tool "${e.name}". Call one of the provided tools by its exact name.`,
          },
        };
      } else {
        try {
          result = await callMCPTool(e.name, args);
        } catch (err) {
          result = { success: false, error: { message: err instanceof Error ? err.message : String(err) } };
        }
      }

      yield { type: "tool_result", payload: { id: e.id, name: e.name, result } };
      messages.push({ role: "tool", tool_call_id: e.id, content: JSON.stringify(result) });
    }
  }

  // Exhausted MAX_ROUNDS without a text finish.
  yield { type: "done", payload: null };
}
