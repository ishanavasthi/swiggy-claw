// Tiebreak: runs the REAL orchestrator (multi-round tool loop) per candidate model.
// Usage: npx tsx scripts/bench-loop.ts
import { createClients } from "../lib/swiggy/mcp-client";
import { loadAllGroqTools, clearToolCache } from "../lib/swiggy/tools";
import { buildCallMCPTool } from "../lib/agent/guards";
import { runAgentStream } from "../lib/agent/orchestrator";
import { SYSTEM_PROMPT } from "../lib/agent/system-prompt";

const CANDIDATES = [
  "openai/gpt-oss-20b",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "deepseek-ai/deepseek-v4-pro",
  "nvidia/nvidia-nemotron-nano-9b-v2",
];

const PROMPT = "Find me a good biryani place near my home and show me what's on the menu.";

async function main() {
  const clients = await createClients("mock-dev-token");

  for (const model of CANDIDATES) {
    process.env.LLM_MODEL = model;
    clearToolCache();
    const { tools, toolServerMap } = await loadAllGroqTools(clients);
    const call = buildCallMCPTool(clients, toolServerMap);

    const t0 = Date.now();
    const toolsUsed: string[] = [];
    let text = "";
    let err = "";
    let rounds = 0;

    try {
      for await (const ev of runAgentStream(PROMPT, [], tools, call, SYSTEM_PROMPT)) {
        if (ev.type === "text_delta") text += ev.payload;
        else if (ev.type === "tool_call") { toolsUsed.push(ev.payload.name); rounds++; }
        else if (ev.type === "error") err = ev.payload.slice(0, 120);
      }
    } catch (e) {
      err = e instanceof Error ? e.message.slice(0, 120) : String(e);
    }

    const ms = Date.now() - t0;
    console.log(`\n=== ${model} ===`);
    console.log(`  ${ms}ms | ${rounds} tool call(s): ${toolsUsed.join(" -> ") || "(none)"}`);
    if (err) console.log(`  ERROR: ${err}`);
    console.log(`  reply: ${text.trim().replace(/\s+/g, " ").slice(0, 260) || "(empty)"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
