// Standalone verification harness (no Next.js). Run: npx tsx scripts/try-loop.ts
// Exercises the mock MCP servers, the guard layer, cap enforcement, idempotent
// placement, and tool-call history replay. If GROQ_API_KEY is set, also runs a real
// end-to-end agent turn.

try {
  (process as any).loadEnvFile?.(".env.local");
} catch {
  /* no .env.local — rely on ambient env */
}

import { getClients } from "@/lib/swiggy/mcp-client";
import { loadAllGroqTools } from "@/lib/swiggy/tools";
import { buildCallMCPTool } from "@/lib/agent/guards";
import { runAgentStream, buildHistoryFromMessages } from "@/lib/agent/orchestrator";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { safePlaceOrder } from "@/lib/swiggy/retry";
import type { ChatMessage } from "@/types/agent";

const line = (s = "") => console.log(s);
const json = (label: string, v: unknown) => console.log(`${label}: ${JSON.stringify(v)}`);

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures += 1;
  line(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * History replay is what lets a turn build on the last one, and it is easy to
 * break silently: an unpaired tool_call is a 400 from the provider, a duplicate
 * call id is ambiguous, and a replayed stale cart gets merged into the live one.
 */
function checkHistoryReplay() {
  const messages: ChatMessage[] = [
    { role: "user", content: "Show my go-to grocery items" },
    {
      role: "assistant",
      content: "Here are your go-to items.",
      toolCalls: [
        { id: "call_1", name: "your_go_to_items", args: {}, result: { success: true, data: { items: [] } } },
        // No result — the turn was cut off before this one resolved.
        { id: "call_2", name: "get_cart", args: {} },
      ],
    },
    { role: "user", content: "add them" },
    {
      role: "assistant",
      content: "Added. Total ₹224.",
      // Same provider-assigned id as the first turn, and a cart snapshot that a
      // later turn supersedes.
      toolCalls: [{ id: "call_1", name: "update_cart", args: { items: [] }, result: { subtotal: 224 } }],
    },
    { role: "user", content: "and bread" },
    {
      role: "assistant",
      content: "Added bread.",
      toolCalls: [{ id: "call_1", name: "update_cart", args: { items: [] }, result: { subtotal: 45 } }],
    },
  ];

  const history = buildHistoryFromMessages(messages);

  const callIds = history.flatMap((m) =>
    m.role === "assistant" ? (m.tool_calls ?? []).map((c) => c.id) : []
  );
  const toolResults = history.filter((m) => m.role === "tool");
  const resultIds = toolResults.map((m) => m.tool_call_id);
  const resultText = (m: (typeof toolResults)[number]) =>
    typeof m.content === "string" ? m.content : m.content.map((p) => p.text).join("");

  check("every tool_call has a matching result", callIds.every((id) => resultIds.includes(id)));
  check("every result has a matching tool_call", resultIds.every((id) => callIds.includes(id)));
  check("call ids are unique across turns", new Set(callIds).size === callIds.length, `${callIds.length} ids`);
  check("a result-less call is not replayed", !callIds.some((id) => id.endsWith("_call_2")));

  const cartResults = toolResults.filter((m) => resultText(m).includes("subtotal"));
  check("only the live cart snapshot keeps its payload", cartResults.length === 1, `${cartResults.length} live`);
  check("the live snapshot is the most recent one", cartResults.some((m) => resultText(m).includes("45")));
  check(
    "superseded snapshots are marked, not dropped",
    toolResults.filter((m) => resultText(m).includes("Superseded")).length === 1
  );
  check(
    "assistant text still reaches the model",
    history.some((m) => m.role === "assistant" && m.content === "Added bread.")
  );
}

async function main() {
  const clients = await getClients();
  const { tools, toolServerMap } = await loadAllGroqTools(clients);
  const call = buildCallMCPTool(clients, toolServerMap);

  line("=== Tool inventory ===");
  const byServer: Record<string, string[]> = { food: [], instamart: [], dineout: [] };
  for (const [name, server] of toolServerMap) byServer[server].push(name);
  for (const s of Object.keys(byServer)) line(`${s} (${byServer[s].length}): ${byServer[s].join(", ")}`);
  line(`total groq tools: ${tools.length}`);

  line("\n=== History replay (tool calls carried across turns) ===");
  checkHistoryReplay();

  line("\n=== Food flow (direct via guard layer) ===");
  json("get_addresses", await call("get_addresses", {}));
  json("search_restaurants", await call("search_restaurants", { query: "biryani", addressId: "addr_1" }));
  json("get_restaurant_menu", await call("get_restaurant_menu", { restaurantId: "rest_1" }));
  json("get_food_cart (empty-arg)", await call("get_food_cart", {}));
  json("update_food_cart", await call("update_food_cart", { restaurantId: "rest_1", items: [{ itemId: "item_1", qty: 1 }] }));
  json("place_food_order", await call("place_food_order", { paymentMethod: "COD" }));

  line("\n=== Cart cap guard (>₹1000) ===");
  await call("flush_food_cart", {});
  await call("update_food_cart", { restaurantId: "rest_1", items: [{ itemId: "item_2", qty: 5 }] }); // 5*399=1995
  const capped = await call("place_food_order", { paymentMethod: "COD" });
  json("place over cap (expect success:false)", capped);
  await call("flush_food_cart", {});

  line("\n=== safePlaceOrder idempotency (5xx then check finds order) ===");
  let placeAttempts = 0;
  const existingOrder = { orderId: "ord_recovered", status: "PLACED" };
  const recovered = await safePlaceOrder(
    async () => {
      placeAttempts += 1;
      const err: any = new Error("Service Unavailable");
      err.status = 503;
      throw err; // simulate a lost response on every place attempt
    },
    async () => existingOrder // check finds the order already went through
  );
  json("recovered order", recovered);
  line(`place attempts before recovery: ${placeAttempts} (expect 1; no double-order)`);

  if (process.env.GROQ_API_KEY) {
    line("\n=== Live agent turn (GROQ_API_KEY present) ===");
    let out = "";
    for await (const ev of runAgentStream(
      "Order one chicken biryani to my Home address. Show me the cart and ask before confirming.",
      [],
      tools,
      call,
      SYSTEM_PROMPT
    )) {
      if (ev.type === "text_delta") out += ev.payload;
      else if (ev.type === "tool_call") line(`  [tool_call] ${ev.payload.name} ${JSON.stringify(ev.payload.args)}`);
      else if (ev.type === "tool_result") line(`  [tool_result] ${ev.payload.name}`);
      else if (ev.type === "error") line(`  [error] ${ev.payload}`);
    }
    line("\n--- assistant text ---");
    line(out);
  } else {
    line("\n(skipping live agent turn — set GROQ_API_KEY in .env.local to run it)");
  }

  if (failures) {
    line(`\n=== ${failures} CHECK(S) FAILED ===`);
    process.exit(1);
  }
  line("\n=== OK ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("HARNESS FAILED:", err);
  process.exit(1);
});
