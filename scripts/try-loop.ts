// Standalone verification harness (no Next.js). Run: npx tsx scripts/try-loop.ts
// Exercises the mock MCP servers, the guard layer, cap enforcement, and idempotent
// placement. If GROQ_API_KEY is set, also runs a real end-to-end agent turn.

try {
  (process as any).loadEnvFile?.(".env.local");
} catch {
  /* no .env.local — rely on ambient env */
}

import { getClients } from "@/lib/swiggy/mcp-client";
import { loadAllGroqTools } from "@/lib/swiggy/tools";
import { buildCallMCPTool } from "@/lib/agent/guards";
import { runAgentStream } from "@/lib/agent/orchestrator";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { safePlaceOrder } from "@/lib/swiggy/retry";

const line = (s = "") => console.log(s);
const json = (label: string, v: unknown) => console.log(`${label}: ${JSON.stringify(v)}`);

async function main() {
  const clients = await getClients();
  const { tools, toolServerMap } = await loadAllGroqTools(clients);
  const call = buildCallMCPTool(clients, toolServerMap);

  line("=== Tool inventory ===");
  const byServer: Record<string, string[]> = { food: [], instamart: [], dineout: [] };
  for (const [name, server] of toolServerMap) byServer[server].push(name);
  for (const s of Object.keys(byServer)) line(`${s} (${byServer[s].length}): ${byServer[s].join(", ")}`);
  line(`total groq tools: ${tools.length}`);

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

  line("\n=== OK ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("HARNESS FAILED:", err);
  process.exit(1);
});
