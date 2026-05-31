// Mock tool registry: one source of truth feeding the mock MCP servers.
// Each tool carries a raw JSON-Schema inputSchema (passed verbatim to Groq) and a handler.

import type { SwiggyServer } from "@/types/agent";
import type { SwiggyOrder } from "@/types/swiggy";
import {
  ADDRESSES,
  MENU,
  COUPONS,
  PRODUCTS,
  GO_TO_ITEMS,
  DINEOUT_LOCATIONS,
  FOOD_CART_CAP,
  INSTAMART_MIN,
  state,
  resetFoodCart,
  resetInstamartCart,
  recomputeFoodCart,
  recomputeInstamartCart,
  findMenuItem,
  findProduct,
} from "./catalog";

type Args = Record<string, any>;
type Json = Record<string, unknown>;

export interface MockTool {
  name: string;
  server: SwiggyServer;
  description: string;
  inputSchema: Json;
  handler: (args: Args) => unknown;
}

const ok = (data: unknown) => ({ success: true, data });
const fail = (message: string) => ({ success: false, error: { message } });

const EMPTY_SCHEMA: Json = { type: "object", properties: {} };

// --- Local mock state not held in catalog ---
const instamartOrders: SwiggyOrder[] = [];

const DINEOUT_RESTAURANTS = [
  { id: "do_1", name: "The Fatty Bao", rating: 4.6, cuisine: "Asian", distance: "1.2 km" },
  { id: "do_2", name: "Toit Brewpub", rating: 4.7, cuisine: "Continental", distance: "2.0 km" },
];

function makeSlots(guestCount: number) {
  // Deterministic 7-band day: alternating free / paid.
  const bands = ["12:30", "13:30", "19:00", "20:00", "20:30", "21:00", "21:30"];
  return bands.map((startTime, i) => ({
    slotId: `slot_${i}`,
    startTime,
    guestCount,
    isFree: i % 2 === 0, // free slots only are bookable
  }));
}

export const MOCK_TOOLS: MockTool[] = [
  // ===================== FOOD =====================
  {
    name: "get_addresses",
    server: "food",
    description: "Resolve the user's saved delivery addresses (label + addressId). Call before any Food/Instamart search.",
    inputSchema: EMPTY_SCHEMA,
    handler: () => ok(ADDRESSES),
  },
  {
    name: "search_restaurants",
    server: "food",
    description: "Find OPEN restaurants for food DELIVERY by query and delivery addressId. Not for table booking.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "e.g. biryani, pizza" },
        addressId: { type: "string", description: "Delivery address id from get_addresses" },
      },
      required: ["query", "addressId"],
    },
    handler: ({ query, addressId }) => {
      if (!addressId) return fail("addressId is required (call get_addresses first)");
      const q = String(query ?? "food");
      return ok({
        restaurants: [
          { id: "rest_1", name: `${q} House`, availabilityStatus: "OPEN", rating: 4.5, deliveryTimeRange: "25–35 MIN", distance: "2.1 km" },
          { id: "rest_2", name: `Best ${q} Co.`, availabilityStatus: "OPEN", rating: 4.3, deliveryTimeRange: "30–40 MIN", distance: "3.2 km" },
        ],
      });
    },
  },
  {
    name: "get_restaurant_menu",
    server: "food",
    description: "Browse a restaurant's menu: categories, items, prices.",
    inputSchema: {
      type: "object",
      properties: { restaurantId: { type: "string" } },
      required: ["restaurantId"],
    },
    handler: ({ restaurantId }) => {
      if (!restaurantId) return fail("restaurantId is required");
      return ok({
        restaurantId,
        categories: [
          { name: "Biryani & Mains", items: MENU.slice(0, 4) },
          { name: "Desserts & Drinks", items: MENU.slice(4) },
        ],
      });
    },
  },
  {
    name: "search_menu",
    server: "food",
    description: "Keyword search for menu items by name.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, restaurantId: { type: "string" } },
      required: ["query"],
    },
    handler: ({ query }) => {
      const q = String(query ?? "").toLowerCase();
      return ok({ items: MENU.filter((m) => m.name.toLowerCase().includes(q)) });
    },
  },
  {
    name: "update_food_cart",
    server: "food",
    description: "Add/remove items in the Food cart (qty 0 removes). A Food cart is bound to ONE restaurant; switching requires flush_food_cart first.",
    inputSchema: {
      type: "object",
      properties: {
        restaurantId: { type: "string", description: "Restaurant the cart is bound to" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { itemId: { type: "string" }, qty: { type: "number" } },
            required: ["itemId", "qty"],
          },
        },
      },
      required: ["restaurantId", "items"],
    },
    handler: ({ restaurantId, items }) => {
      if (!restaurantId) return fail("restaurantId is required");
      const cart = state.foodCart;
      if (cart.items.length > 0 && cart.restaurantId && cart.restaurantId !== restaurantId) {
        return fail(`Cart is bound to restaurant ${cart.restaurantId}. Call flush_food_cart to switch restaurants.`);
      }
      cart.restaurantId = restaurantId;
      for (const it of (items ?? []) as Args[]) {
        const menuItem = findMenuItem(String(it.itemId));
        if (!menuItem) return fail(`Unknown itemId: ${it.itemId}`);
        const qty = Number(it.qty);
        const idx = cart.items.findIndex((c) => c.itemId === menuItem.id);
        if (qty <= 0) {
          if (idx >= 0) cart.items.splice(idx, 1);
          continue;
        }
        const line = { itemId: menuItem.id, name: menuItem.name, qty, unitPrice: menuItem.price, lineTotal: menuItem.price * qty };
        if (idx >= 0) cart.items[idx] = line;
        else cart.items.push(line);
      }
      recomputeFoodCart();
      return ok(cart);
    },
  },
  {
    name: "get_food_cart",
    server: "food",
    description: "Current Food cart state. Call before any cart mutation or order placement.",
    inputSchema: EMPTY_SCHEMA,
    handler: () => ok(state.foodCart),
  },
  {
    name: "flush_food_cart",
    server: "food",
    description: "Clear the Food cart explicitly.",
    inputSchema: EMPTY_SCHEMA,
    handler: () => {
      resetFoodCart();
      return ok(state.foodCart);
    },
  },
  {
    name: "fetch_food_coupons",
    server: "food",
    description: "Available coupons. v1 is COD-only — only apply coupons where requiresOnlinePayment is false.",
    inputSchema: EMPTY_SCHEMA,
    handler: () => ok({ coupons: COUPONS }),
  },
  {
    name: "apply_food_coupon",
    server: "food",
    description: "Apply a coupon code to the active Food cart.",
    inputSchema: {
      type: "object",
      properties: { code: { type: "string" } },
      required: ["code"],
    },
    handler: ({ code }) => {
      const coupon = COUPONS.find((c) => c.code === String(code).toUpperCase());
      if (!coupon) return fail(`Unknown coupon code: ${code}`);
      if (coupon.requiresOnlinePayment) return fail(`Coupon ${coupon.code} requires online payment; v1 supports COD only.`);
      const cart = state.foodCart;
      if (cart.items.length === 0) return fail("Cart is empty.");
      const discount = Math.min(coupon.discount, cart.subtotal);
      return ok({ ...cart, appliedCoupon: coupon.code, discount, total: cart.subtotal + cart.deliveryFee - discount });
    },
  },
  {
    name: "place_food_order",
    server: "food",
    description: "Place the Food order (COD only, ₹1000 cart cap). NOT idempotent — verify with get_food_orders before any retry.",
    inputSchema: {
      type: "object",
      properties: { paymentMethod: { type: "string", enum: ["COD"], description: "Only COD in v1" } },
    },
    handler: ({ paymentMethod }) => {
      const cart = state.foodCart;
      if (cart.items.length === 0) return fail("Cart is empty.");
      if (paymentMethod && String(paymentMethod).toUpperCase() !== "COD") return fail("Only Cash on Delivery (COD) is supported in v1.");
      if (cart.total > FOOD_CART_CAP) return fail(`Cart total ₹${cart.total} exceeds the ₹${FOOD_CART_CAP} cap.`);
      state.orderSeq += 1;
      const order: SwiggyOrder = { orderId: `ord_${state.orderSeq}`, status: "PLACED", estimatedDeliveryTime: "35 min", total: cart.total };
      state.foodOrders.push(order);
      resetFoodCart();
      return ok(order);
    },
  },
  {
    name: "get_food_orders",
    server: "food",
    description: "List placed Food orders. Use to verify whether an order went through before retrying place_food_order.",
    inputSchema: EMPTY_SCHEMA,
    handler: () => ok({ orders: state.foodOrders }),
  },
  {
    name: "track_food_order",
    server: "food",
    description: "Live delivery status for an order. Poll no more than every 10s.",
    inputSchema: {
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
    },
    handler: ({ orderId }) => {
      const order = state.foodOrders.find((o) => o.orderId === orderId);
      if (!order) return fail(`Unknown orderId: ${orderId}`);
      return ok({ orderId, status: "OUT_FOR_DELIVERY", etaMinutes: 22 });
    },
  },
  {
    name: "report_error",
    server: "food",
    description: "Send an in-session error report to the Swiggy team.",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
    handler: ({ message }) => ok({ reported: true, message }),
  },

  // ===================== INSTAMART =====================
  {
    name: "get_addresses_im",
    server: "instamart",
    description: "Resolve saved delivery addresses for Instamart (same user session as Food).",
    inputSchema: EMPTY_SCHEMA,
    handler: () => ok(ADDRESSES),
  },
  {
    name: "search_products",
    server: "instamart",
    description: "Search Instamart SKUs. Returns variants with spinId (used to add to cart).",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, addressId: { type: "string" } },
      required: ["query"],
    },
    handler: ({ query }) => {
      const q = String(query ?? "").toLowerCase();
      const hits = PRODUCTS.filter((p) => p.name.toLowerCase().includes(q));
      return ok({ products: hits.length ? hits : PRODUCTS });
    },
  },
  {
    name: "your_go_to_items",
    server: "instamart",
    description: "The user's frequent SKUs — prefer this for reorders (one call vs many searches).",
    inputSchema: EMPTY_SCHEMA,
    handler: () => ok({ items: GO_TO_ITEMS }),
  },
  {
    name: "update_cart",
    server: "instamart",
    description: "Add/remove Instamart items by spinId (qty 0 removes).",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { spinId: { type: "string" }, qty: { type: "number" } },
            required: ["spinId", "qty"],
          },
        },
      },
      required: ["items"],
    },
    handler: ({ items }) => {
      const cart = state.instamartCart;
      for (const it of (items ?? []) as Args[]) {
        const product = findProduct(String(it.spinId));
        if (!product) return fail(`Unknown spinId: ${it.spinId}`);
        const qty = Number(it.qty);
        const idx = cart.items.findIndex((c) => c.spinId === product.spinId);
        if (qty <= 0) {
          if (idx >= 0) cart.items.splice(idx, 1);
          continue;
        }
        const line = { spinId: product.spinId, name: product.name, qty, unitPrice: product.price, lineTotal: product.price * qty };
        if (idx >= 0) cart.items[idx] = line;
        else cart.items.push(line);
      }
      recomputeInstamartCart();
      return ok(cart);
    },
  },
  {
    name: "get_cart",
    server: "instamart",
    description: "Current Instamart cart. Call before any mutation or checkout.",
    inputSchema: EMPTY_SCHEMA,
    handler: () => ok(state.instamartCart),
  },
  {
    name: "clear_cart",
    server: "instamart",
    description: "Clear the Instamart cart (e.g. before switching delivery address).",
    inputSchema: EMPTY_SCHEMA,
    handler: () => {
      resetInstamartCart();
      return ok(state.instamartCart);
    },
  },
  {
    name: "checkout",
    server: "instamart",
    description: "Place the grocery order (COD). Requires ₹99 minimum. NOT idempotent — verify with get_orders before retry.",
    inputSchema: {
      type: "object",
      properties: { paymentMethod: { type: "string", enum: ["COD"] } },
    },
    handler: ({ paymentMethod }) => {
      const cart = state.instamartCart;
      if (cart.items.length === 0) return fail("Cart is empty.");
      if (paymentMethod && String(paymentMethod).toUpperCase() !== "COD") return fail("Only COD is supported in v1.");
      if (cart.subtotal < INSTAMART_MIN) return fail(`Order subtotal ₹${cart.subtotal} is below the ₹${INSTAMART_MIN} minimum.`);
      const order: SwiggyOrder = { orderId: `im_ord_${instamartOrders.length + 1}`, status: "PLACED", estimatedDeliveryTime: "15 min", total: cart.total };
      instamartOrders.push(order);
      resetInstamartCart();
      return ok(order);
    },
  },
  {
    name: "get_orders",
    server: "instamart",
    description: "List placed Instamart orders. Use to verify before retrying checkout.",
    inputSchema: EMPTY_SCHEMA,
    handler: () => ok({ orders: instamartOrders }),
  },
  {
    name: "track_order",
    server: "instamart",
    description: "Instamart delivery ETA. Poll no more than every 10s.",
    inputSchema: {
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
    },
    handler: ({ orderId }) => {
      const order = instamartOrders.find((o) => o.orderId === orderId);
      if (!order) return fail(`Unknown orderId: ${orderId}`);
      return ok({ orderId, status: "PACKED", etaMinutes: 12 });
    },
  },

  // ===================== DINEOUT (lat/lng, NOT addressId) =====================
  {
    name: "get_saved_locations",
    server: "dineout",
    description: "Saved locations for Dineout as lat/lng coordinates (NOT addressId). Use before searching dine-in restaurants.",
    inputSchema: EMPTY_SCHEMA,
    handler: () => ok({ locations: DINEOUT_LOCATIONS }),
  },
  {
    name: "search_restaurants_dineout",
    server: "dineout",
    description: "Find dine-in restaurants near lat/lng for TABLE BOOKING (not delivery). Never pass an addressId here.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        lat: { type: "number" },
        lng: { type: "number" },
      },
      required: ["lat", "lng"],
    },
    handler: ({ lat, lng }) => {
      if (typeof lat !== "number" || typeof lng !== "number") return fail("lat and lng are required (from get_saved_locations).");
      return ok({ restaurants: DINEOUT_RESTAURANTS });
    },
  },
  {
    name: "get_restaurant_details",
    server: "dineout",
    description: "Ratings, deals, amenities and opening hours for a dine-in restaurant.",
    inputSchema: {
      type: "object",
      properties: { restaurantId: { type: "string" } },
      required: ["restaurantId"],
    },
    handler: ({ restaurantId }) => {
      const r = DINEOUT_RESTAURANTS.find((x) => x.id === restaurantId);
      if (!r) return fail(`Unknown restaurantId: ${restaurantId}`);
      return ok({ ...r, amenities: ["Bar", "Outdoor seating", "Parking"], deals: ["20% off food (free slot)"], hours: "12:00–23:00" });
    },
  },
  {
    name: "get_available_slots",
    server: "dineout",
    description: "7-day-forward table availability for a restaurant by date and party size. Only isFree slots are bookable in v1.",
    inputSchema: {
      type: "object",
      properties: {
        restaurantId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        guestCount: { type: "number" },
      },
      required: ["restaurantId", "date", "guestCount"],
    },
    handler: ({ restaurantId, date, guestCount }) => {
      if (!restaurantId) return fail("restaurantId is required");
      return ok({ restaurantId, date, slots: makeSlots(Number(guestCount) || 2) });
    },
  },
  {
    name: "book_table",
    server: "dineout",
    description: "Reserve a table. FREE slots only (isFree:true). NOT idempotent — verify with get_booking_status before retry.",
    inputSchema: {
      type: "object",
      properties: {
        restaurantId: { type: "string" },
        slotId: { type: "string" },
        date: { type: "string" },
        guestCount: { type: "number" },
      },
      required: ["restaurantId", "slotId", "date", "guestCount"],
    },
    handler: ({ restaurantId, slotId, date, guestCount }) => {
      const r = DINEOUT_RESTAURANTS.find((x) => x.id === restaurantId);
      if (!r) return fail(`Unknown restaurantId: ${restaurantId}`);
      const slot = makeSlots(Number(guestCount) || 2).find((s) => s.slotId === slotId);
      if (!slot) return fail(`Unknown slotId: ${slotId}`);
      if (!slot.isFree) return fail("That slot is paid; v1 supports FREE slots only. Pick an isFree slot.");
      state.bookingSeq += 1;
      const booking = {
        bookingId: `bk_${state.bookingSeq}`,
        status: "CONFIRMED",
        restaurantName: r.name,
        restaurantAddress: `${r.name}, Indiranagar, Bangalore`,
        slot: `${date} ${slot.startTime}`,
        guestCount: Number(guestCount) || 2,
      };
      state.bookings.push(booking);
      return ok(booking);
    },
  },
  {
    name: "get_booking_status",
    server: "dineout",
    description: "Reservation confirmation + restaurant address.",
    inputSchema: {
      type: "object",
      properties: { bookingId: { type: "string" } },
      required: ["bookingId"],
    },
    handler: ({ bookingId }) => {
      const b = state.bookings.find((x) => x.bookingId === bookingId);
      if (!b) return fail(`Unknown bookingId: ${bookingId}`);
      return ok(b);
    },
  },
];

export const MOCK_TOOLS_BY_SERVER: Record<SwiggyServer, MockTool[]> = {
  food: MOCK_TOOLS.filter((t) => t.server === "food"),
  instamart: MOCK_TOOLS.filter((t) => t.server === "instamart"),
  dineout: MOCK_TOOLS.filter((t) => t.server === "dineout"),
};
