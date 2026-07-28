// Benchmarks NVIDIA NIM models against this project's real Swiggy tool schemas.
// Usage: NVIDIA_API_KEY=... npx tsx scripts/bench-nvidia.ts
import type { ChatCompletionFunctionTool } from "openai/resources/chat/completions";
import { createClients } from "../lib/swiggy/mcp-client";
import { loadAllGroqTools } from "../lib/swiggy/tools";
import { SYSTEM_PROMPT } from "../lib/agent/system-prompt";

const URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const KEY = process.env.NVIDIA_API_KEY;
if (!KEY) throw new Error("NVIDIA_API_KEY required");
const TIMEOUT_MS = 40_000;

const MODELS = [
  "openai/gpt-oss-20b",
  "nvidia/nvidia-nemotron-nano-9b-v2",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3-nano-30b-a3b",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "deepseek-ai/deepseek-v4-pro",
  "deepseek-ai/deepseek-v4-flash",
  "nvidia/llama-3.1-nemotron-70b-instruct",
];

// accept = tool names that are a defensible FIRST move (routing to the right
// server matters more than which specific step it starts with).
const CASES = [
  { prompt: "find me biryani near my home", accept: ["search_restaurants", "get_addresses", "search_menu"] },
  { prompt: "add 2 cokes to my instamart cart", accept: ["search_products", "get_addresses_im", "update_cart", "your_go_to_items", "get_cart"] },
  { prompt: "book a table for 2 tonight at 8pm", accept: ["search_restaurants_dineout", "get_saved_locations", "get_available_slots", "get_restaurant_details"] },
];

interface Call { name: string; args: string }

async function callModel(model: string, prompt: string, tools: ChatCompletionFunctionTool[]) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL, {
      method: "POST",
      signal: ac.signal,
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        model, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }],
        tools, tool_choice: "auto", temperature: 0.2, max_tokens: 1024, stream: true,
      }),
    });
    if (!res.ok || !res.body) return { err: `HTTP ${res.status}: ${(await res.text()).slice(0, 70)}` };

    const calls = new Map<number, Call>();
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const d = line.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        try {
          const delta = JSON.parse(d).choices?.[0]?.delta;
          for (const tc of delta?.tool_calls ?? []) {
            const idx = tc.index ?? 0;
            const e = calls.get(idx) ?? { name: "", args: "" };
            if (tc.function?.name) e.name = tc.function.name;
            if (tc.function?.arguments) e.args += tc.function.arguments;
            calls.set(idx, e);
          }
        } catch { /* skip partial frame */ }
      }
    }
    return { calls: [...calls.values()] };
  } catch (e) {
    return { err: e instanceof Error && e.name === "AbortError" ? `timeout >${TIMEOUT_MS / 1000}s` : String(e).slice(0, 70) };
  } finally { clearTimeout(timer); }
}

async function run() {
  const clients = await createClients("bench-token");
  const { tools } = await loadAllGroqTools(clients);
  const valid = new Set((tools as ChatCompletionFunctionTool[]).map((t) => t.function.name));
  console.log(`${tools.length} tool schemas loaded. ${MODELS.length} models x ${CASES.length} cases.\n`);

  const rows: { model: string; correct: number; ms: number; note: string }[] = [];

  for (const model of MODELS) {
    let correct = 0; const times: number[] = []; let note = "";
    for (const c of CASES) {
      const t0 = Date.now();
      const r = await callModel(model, c.prompt, tools as ChatCompletionFunctionTool[]);
      if ("err" in r && r.err) { note ||= r.err; continue; }
      times.push(Date.now() - t0);
      const names = (r.calls ?? []).map((v) => v.name).filter(Boolean);
      const bad = names.filter((n) => !valid.has(n));
      const argsOk = (r.calls ?? []).every((v) => { if (!v.args?.trim()) return true; try { JSON.parse(v.args); return true; } catch { return false; } });
      if (names.some((n) => c.accept.includes(n)) && !bad.length && argsOk) correct++;
      else if (bad.length) note ||= `hallucinated ${bad[0]}`;
      else if (!argsOk) note ||= "malformed args";
      else if (!names.length) note ||= "no tool call";
      else note ||= `picked ${names[0]}`;
    }
    const ms = times.length ? Math.round(times.reduce((a, b) => a + b) / times.length) : 0;
    rows.push({ model, correct, ms, note });
    console.log(`${correct}/${CASES.length}  ${String(ms).padStart(6)}ms  ${model}${note ? `  — ${note}` : ""}`);
  }

  console.log("\n--- ranked (accuracy, then latency) ---");
  rows.filter(r => r.correct > 0).sort((a, b) => b.correct - a.correct || a.ms - b.ms)
    .forEach((r, i) => console.log(`${i + 1}. ${r.model}  ${r.correct}/${CASES.length}  ${r.ms}ms`));
}

run().catch((e) => { console.error(e); process.exit(1); });
