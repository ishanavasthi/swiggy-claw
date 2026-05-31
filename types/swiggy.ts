// Swiggy tool response shapes (mirrors the mock MCP server; real endpoints may differ).

export type SwiggyToolResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { message: string; reportLink?: string } };

export interface SwiggyAddress {
  id: string;
  label: string;
  addressLine: string;
}

export interface SwiggyRestaurant {
  id: string;
  name: string;
  availabilityStatus: "OPEN" | "CLOSED";
  rating: number;
  deliveryTimeRange: string;
  distance: string;
}

export interface SwiggyMenuItem {
  id: string;
  name: string;
  price: number;
  shortDescription?: string;
  longDescription?: string;
}

export interface SwiggyMenuCategory {
  name: string;
  items: SwiggyMenuItem[];
}

export interface SwiggyCartItem {
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SwiggyCart {
  cartId: string;
  restaurantId: string | null;
  items: SwiggyCartItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
}

export interface SwiggyOrder {
  orderId: string;
  status: string;
  estimatedDeliveryTime: string;
  total: number;
}

export interface SwiggyCoupon {
  code: string;
  description: string;
  requiresOnlinePayment: boolean;
  discount: number;
}

// --- Instamart ---
export interface SwiggyProduct {
  spinId: string;
  name: string;
  price: number;
  unit: string;
}

export interface InstamartCartItem {
  spinId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface InstamartCart {
  cartId: string;
  items: InstamartCartItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
}

// --- Dineout (uses lat/lng, NOT addressId) ---
export interface DineoutLocation {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export interface DineoutRestaurant {
  id: string;
  name: string;
  rating: number;
  cuisine: string;
  distance: string;
}

export interface DineoutSlot {
  slotId: string;
  startTime: string;
  guestCount: number;
  isFree: boolean;
}

export interface DineoutBooking {
  bookingId: string;
  status: string;
  restaurantName: string;
  restaurantAddress: string;
  slot: string;
  guestCount: number;
}
