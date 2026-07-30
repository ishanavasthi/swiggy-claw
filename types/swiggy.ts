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
  city: string;
  /** Where the user dined out last — the sensible fallback when nothing matches. */
  isDefault?: boolean;
}

/**
 * A dine-in restaurant as it sits in the catalog. Distance is deliberately absent:
 * it depends on the lat/lng the search was run from, so it's computed per call.
 */
export interface DineoutRestaurant {
  id: string;
  name: string;
  /** Display cuisine, e.g. "Asian · Bar". `cuisines` is what search matches on. */
  cuisine: string;
  cuisines: string[];
  rating: number;
  ratingCount: number;
  area: string;
  address: string;
  lat: number;
  lng: number;
  priceForTwo: number;
  /** CLOSED here means "not taking table bookings", not "kitchen shut". */
  availabilityStatus: "OPEN" | "CLOSED";
  closedReason?: string;
  /** "HH:MM–HH:MM" (en dash). Slots outside these hours aren't offered. */
  hours: string;
  amenities: string[];
  deals: string[];
  mustTry: string[];
  /** Largest party one booking seats. */
  maxPartySize: number;
}

/** One row of a dineout search result — list fields only, plus distance. */
export interface DineoutSearchResult {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  ratingCount: number;
  area: string;
  distance: string;
  priceForTwo: number;
  availabilityStatus: "OPEN" | "CLOSED";
  closedReason?: string;
  topDeal?: string;
}

export interface DineoutSlot {
  slotId: string;
  startTime: string;
  /** "Lunch" | "Early dinner" | "Dinner" | "Late night" */
  band: string;
  guestCount: number;
  isFree: boolean;
  /** Table-level offer, on free slots only. */
  offer?: string;
  /** Premium slots charge this to hold the table — not bookable in v1. */
  bookingFee?: number;
}

export interface DineoutBooking {
  bookingId: string;
  status: string;
  restaurantId: string;
  restaurantName: string;
  restaurantAddress: string;
  slot: string;
  startTime: string;
  guestCount: number;
  offer?: string;
  /** Quoted at the host desk. */
  confirmationCode: string;
}
