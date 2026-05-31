// Builds the callMCPTool function the orchestrator uses. Guards run OUT-OF-BAND:
// they never splice synthetic tool/assistant messages into history. Instead they
// short-circuit with an ordinary tool result the model can react to, or wrap
// non-idempotent placement with check-then-retry.

import { callTool, type SwiggyMCPClients } from "@/lib/swiggy/mcp-client";
import { safePlaceOrder } from "@/lib/swiggy/retry";
import type { SwiggyServer } from "@/types/agent";

const FOOD_CART_CAP = 1000;

type DomainResult = { success: boolean; data?: any; error?: { message: string } };

export type CallMCPTool = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export function buildCallMCPTool(
  clients: SwiggyMCPClients,
  toolServerMap: Map<string, SwiggyServer>
): CallMCPTool {
  const call = (name: string, args: Record<string, unknown>) => callTool(clients, name, args, toolServerMap);

  return async function callMCPTool(name, args) {
    // --- Pre-call guard: enforce the ₹1000 cap before placing a food order ---
    if (name === "place_food_order") {
      const cart = (await call("get_food_cart", {})) as DomainResult;
      const total = Number(cart?.data?.total ?? 0);
      if (cart?.success && total > FOOD_CART_CAP) {
        return {
          success: false,
          error: { message: `Cart total ₹${total} exceeds the ₹${FOOD_CART_CAP} cap. Remove items before placing the order.` },
        };
      }
      return safePlaceOrder(
        () => call("place_food_order", args),
        async () => {
          const res = (await call("get_food_orders", {})) as DomainResult;
          const orders = res?.data?.orders ?? [];
          return orders.length ? { success: true, data: orders[orders.length - 1] } : null;
        }
      );
    }

    // --- Instamart checkout: check-then-retry on lost response ---
    if (name === "checkout") {
      return safePlaceOrder(
        () => call("checkout", args),
        async () => {
          const res = (await call("get_orders", {})) as DomainResult;
          const orders = res?.data?.orders ?? [];
          return orders.length ? { success: true, data: orders[orders.length - 1] } : null;
        }
      );
    }

    // book_table is non-idempotent but the mock has no list endpoint to verify a lost
    // response, so retrying could double-book. Call directly; a real adapter should
    // wrap this with a bookings-list checkFn once available.
    return call(name, args);
  };
}
