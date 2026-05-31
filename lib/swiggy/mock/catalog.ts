// Static mock catalog + in-process server-side state for the mock MCP server.
// Single-process dev backend: cart/order/booking state is module-scoped.

import type {
  SwiggyAddress,
  SwiggyMenuItem,
  SwiggyCart,
  SwiggyOrder,
  SwiggyCoupon,
  SwiggyProduct,
  InstamartCart,
  DineoutLocation,
  DineoutBooking,
} from "@/types/swiggy";

export const FOOD_CART_CAP = 1000;
export const INSTAMART_MIN = 99;
export const DELIVERY_FEE = 30;

export const ADDRESSES: SwiggyAddress[] = [
  { id: "addr_1", label: "Home", addressLine: "123 MG Road, Bangalore 560001" },
  { id: "addr_2", label: "Office", addressLine: "91 Springboard, Koramangala 560034" },
];

// One shared menu keyed by item id; restaurants reference the same catalog for simplicity.
export const MENU: SwiggyMenuItem[] = [
  { id: "item_1", name: "Chicken Biryani", price: 299, shortDescription: "Aromatic basmati, slow-cooked", longDescription: "Hyderabadi dum biryani with tender chicken, saffron and fried onions." },
  { id: "item_2", name: "Mutton Biryani", price: 399, shortDescription: "Tender mutton, saffron rice", longDescription: "Slow-cooked mutton layered with long-grain basmati and whole spices." },
  { id: "item_3", name: "Veg Biryani", price: 249, shortDescription: "Seasonal veg, fragrant rice", longDescription: "Mixed vegetables and paneer in spiced basmati." },
  { id: "item_4", name: "Paneer Tikka", price: 279, shortDescription: "Charred cottage cheese", longDescription: "Marinated paneer grilled in a tandoor with peppers and onion." },
  { id: "item_5", name: "Gulab Jamun (2 pcs)", price: 99, shortDescription: "Warm milk-solid dumplings", longDescription: "Soft khoya dumplings soaked in cardamom sugar syrup." },
  { id: "item_6", name: "Coke (500ml)", price: 60, shortDescription: "Chilled soft drink" },
];

export const COUPONS: SwiggyCoupon[] = [
  { code: "FLAT50", description: "₹50 off (Cash on Delivery eligible)", requiresOnlinePayment: false, discount: 50 },
  { code: "TRYNEW75", description: "₹75 off for new users (COD)", requiresOnlinePayment: false, discount: 75 },
  { code: "ONLINE100", description: "₹100 off — online payment only", requiresOnlinePayment: true, discount: 100 },
];

// --- Instamart catalog ---
export const PRODUCTS: SwiggyProduct[] = [
  { spinId: "spin_milk_1l", name: "Amul Gold Milk", price: 72, unit: "1 L" },
  { spinId: "spin_bread_400", name: "Britannia Brown Bread", price: 45, unit: "400 g" },
  { spinId: "spin_eggs_6", name: "Farm Eggs", price: 66, unit: "6 pcs" },
  { spinId: "spin_bananas_1", name: "Robusta Bananas", price: 49, unit: "1 dozen" },
  { spinId: "spin_maggi_4", name: "Maggi Noodles", price: 56, unit: "4 pack" },
];

export const GO_TO_ITEMS: SwiggyProduct[] = [PRODUCTS[0], PRODUCTS[2], PRODUCTS[4]];

// --- Dineout catalog (lat/lng, NOT addressId) ---
export const DINEOUT_LOCATIONS: DineoutLocation[] = [
  { id: "loc_1", label: "Indiranagar", lat: 12.9719, lng: 77.6412 },
  { id: "loc_2", label: "Koramangala", lat: 12.9352, lng: 77.6245 },
];

// --- Mutable server-side state (single process / single dev user) ---
interface MockState {
  foodCart: SwiggyCart;
  instamartCart: InstamartCart;
  foodOrders: SwiggyOrder[];
  bookings: DineoutBooking[];
  orderSeq: number;
  bookingSeq: number;
}

function emptyFoodCart(): SwiggyCart {
  return { cartId: "food_cart", restaurantId: null, items: [], subtotal: 0, deliveryFee: 0, total: 0 };
}
function emptyInstamartCart(): InstamartCart {
  return { cartId: "im_cart", items: [], subtotal: 0, deliveryFee: 0, total: 0 };
}

export const state: MockState = {
  foodCart: emptyFoodCart(),
  instamartCart: emptyInstamartCart(),
  foodOrders: [],
  bookings: [],
  orderSeq: 0,
  bookingSeq: 0,
};

export function resetFoodCart() {
  state.foodCart = emptyFoodCart();
}
export function resetInstamartCart() {
  state.instamartCart = emptyInstamartCart();
}

export function recomputeFoodCart() {
  const c = state.foodCart;
  c.subtotal = c.items.reduce((s, i) => s + i.lineTotal, 0);
  c.deliveryFee = c.items.length > 0 ? DELIVERY_FEE : 0;
  c.total = c.subtotal + c.deliveryFee;
  if (c.items.length === 0) c.restaurantId = null;
}
export function recomputeInstamartCart() {
  const c = state.instamartCart;
  c.subtotal = c.items.reduce((s, i) => s + i.lineTotal, 0);
  c.deliveryFee = c.items.length > 0 ? DELIVERY_FEE : 0;
  c.total = c.subtotal + c.deliveryFee;
}

export function findMenuItem(id: string): SwiggyMenuItem | undefined {
  return MENU.find((m) => m.id === id);
}
export function findProduct(spinId: string): SwiggyProduct | undefined {
  return PRODUCTS.find((p) => p.spinId === spinId);
}
