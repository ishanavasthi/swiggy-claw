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
  DineoutRestaurant,
  DineoutSlot,
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
  { id: "loc_1", label: "Indiranagar", lat: 12.9762, lng: 77.6402, city: "Bangalore", isDefault: true },
  { id: "loc_2", label: "Koramangala", lat: 12.9352, lng: 77.6245, city: "Bangalore" },
  { id: "loc_3", label: "HSR Layout", lat: 12.9116, lng: 77.6474, city: "Bangalore" },
  { id: "loc_4", label: "Church Street", lat: 12.9752, lng: 77.605, city: "Bangalore" },
  { id: "loc_5", label: "Jayanagar", lat: 12.925, lng: 77.5938, city: "Bangalore" },
  { id: "loc_6", label: "Whitefield", lat: 12.966, lng: 77.73, city: "Bangalore" },
];

export const DINEOUT_RESTAURANTS: DineoutRestaurant[] = [
  {
    id: "do_1",
    name: "The Fatty Bao",
    cuisine: "Asian · Bar",
    cuisines: ["Asian", "Japanese", "Rooftop", "Bar"],
    rating: 4.6,
    ratingCount: 3421,
    area: "Indiranagar",
    address: "610, 12th Main, HAL 2nd Stage, Indiranagar, Bangalore 560008",
    lat: 12.9719,
    lng: 77.6412,
    priceForTwo: 1600,
    availabilityStatus: "OPEN",
    hours: "12:00–23:00",
    amenities: ["Rooftop", "Full bar", "Valet parking", "Outdoor seating"],
    deals: ["20% off the total bill", "Complimentary bao platter for 4+ guests"],
    mustTry: ["Bao Trio", "Fatty Ramen", "Truffle Edamame"],
    maxPartySize: 10,
  },
  {
    id: "do_2",
    name: "Toit Brewpub",
    cuisine: "Brewpub · Continental",
    cuisines: ["Continental", "Brewpub", "Pizza", "Bar"],
    rating: 4.7,
    ratingCount: 12804,
    area: "Indiranagar",
    address: "298, 100 Feet Road, Indiranagar, Bangalore 560038",
    lat: 12.9784,
    lng: 77.6408,
    priceForTwo: 1800,
    availabilityStatus: "OPEN",
    hours: "12:00–23:30",
    amenities: ["In-house brewery", "Live screenings", "Smoking area", "Valet parking"],
    deals: ["15% off food (drinks excluded)", "Flat ₹200 off for 2+ guests"],
    mustTry: ["Toit Red", "Basil Chicken Pizza", "Pork Ribs"],
    maxPartySize: 12,
  },
  {
    id: "do_3",
    name: "Sriracha",
    cuisine: "Pan-Asian",
    cuisines: ["Pan-Asian", "Thai", "Chinese", "Bar"],
    rating: 4.4,
    ratingCount: 2140,
    area: "Indiranagar",
    address: "1206, 9th Cross, HAL 2nd Stage, Indiranagar, Bangalore 560038",
    lat: 12.9756,
    lng: 77.6395,
    priceForTwo: 1400,
    availabilityStatus: "OPEN",
    hours: "12:00–23:00",
    amenities: ["Full bar", "Outdoor seating", "Wheelchair accessible"],
    deals: ["25% off the total bill"],
    mustTry: ["Khao Soi", "Sticky Pork Ribs", "Burnt Garlic Rice"],
    maxPartySize: 8,
  },
  {
    id: "do_4",
    name: "Naru Noodle Bar",
    cuisine: "Japanese · Ramen",
    cuisines: ["Japanese", "Ramen", "Asian"],
    rating: 4.8,
    ratingCount: 1187,
    area: "Indiranagar",
    address: "2179, 16th Main, HAL 2nd Stage, Indiranagar, Bangalore 560008",
    lat: 12.9702,
    lng: 77.6389,
    priceForTwo: 1200,
    availabilityStatus: "CLOSED",
    closedReason: "Booked out for the next 3 days — 14 seats, chef's counter only",
    hours: "18:30–22:30",
    amenities: ["Chef's counter", "Tasting menu"],
    deals: [],
    mustTry: ["Shoyu Ramen", "Chicken Karaage"],
    maxPartySize: 4,
  },
  {
    id: "do_5",
    name: "The Permit Room",
    cuisine: "South Indian · Bar",
    cuisines: ["South Indian", "Bar", "Coastal"],
    rating: 4.5,
    ratingCount: 5327,
    area: "Koramangala",
    address: "77, 5th Block, Koramangala, Bangalore 560095",
    lat: 12.9345,
    lng: 77.6266,
    priceForTwo: 1500,
    availabilityStatus: "OPEN",
    hours: "12:00–23:00",
    amenities: ["Full bar", "Live music", "Valet parking"],
    deals: ["20% off food", "1+1 on cocktails till 8 PM"],
    mustTry: ["Kori Gassi", "Ghee Roast Dosa", "Filter Coffee Old Fashioned"],
    maxPartySize: 10,
  },
  {
    id: "do_6",
    name: "Truffles",
    cuisine: "American · Burgers",
    cuisines: ["American", "Burgers", "Steak", "Cafe"],
    rating: 4.5,
    ratingCount: 18942,
    area: "Koramangala",
    address: "22, 4th B Cross, 5th Block, Koramangala, Bangalore 560034",
    lat: 12.9345,
    lng: 77.6141,
    priceForTwo: 800,
    availabilityStatus: "OPEN",
    hours: "11:00–23:00",
    amenities: ["Family friendly", "Air conditioned"],
    deals: ["10% off the total bill"],
    mustTry: ["Chicken Steak Burger", "Loaded Fries", "Death by Chocolate"],
    maxPartySize: 8,
  },
  {
    id: "do_7",
    name: "Onesta",
    cuisine: "Italian · Pizza",
    cuisines: ["Italian", "Pizza", "Pasta"],
    rating: 4.3,
    ratingCount: 9418,
    area: "Koramangala",
    address: "118, 7th Block, Koramangala, Bangalore 560095",
    lat: 12.9366,
    lng: 77.627,
    priceForTwo: 700,
    availabilityStatus: "OPEN",
    hours: "11:30–23:00",
    amenities: ["Family friendly", "Unlimited menu", "Air conditioned"],
    deals: ["Unlimited pizza on weekdays"],
    mustTry: ["Peri Peri Paneer Pizza", "Garlic Bread Sticks"],
    maxPartySize: 12,
  },
  {
    id: "do_8",
    name: "Chinita Real Mexican Food",
    cuisine: "Mexican",
    cuisines: ["Mexican", "Tacos", "Bar"],
    rating: 4.6,
    ratingCount: 4213,
    area: "HSR Layout",
    address: "1085, 24th Main, Sector 2, HSR Layout, Bangalore 560102",
    lat: 12.9121,
    lng: 77.6446,
    priceForTwo: 1100,
    availabilityStatus: "OPEN",
    hours: "12:00–22:30",
    amenities: ["Outdoor seating", "Full bar", "Pet friendly"],
    deals: ["20% off food", "Free churros with 2 mains"],
    mustTry: ["Al Pastor Tacos", "Loaded Nachos", "Churros"],
    maxPartySize: 8,
  },
  {
    id: "do_9",
    name: "Chianti",
    cuisine: "Italian · Fine dining",
    cuisines: ["Italian", "Fine dining", "Wine"],
    rating: 4.4,
    ratingCount: 2673,
    area: "HSR Layout",
    address: "162, 27th Main, Sector 1, HSR Layout, Bangalore 560102",
    lat: 12.9138,
    lng: 77.6489,
    priceForTwo: 1700,
    availabilityStatus: "OPEN",
    hours: "12:30–23:00",
    amenities: ["Wine list", "Private dining", "Valet parking"],
    deals: ["15% off the total bill"],
    mustTry: ["Truffle Tagliatelle", "Tiramisu"],
    maxPartySize: 14,
  },
  {
    id: "do_10",
    name: "Koshy's",
    cuisine: "Continental · Indian",
    cuisines: ["Continental", "North Indian", "Cafe", "Bar"],
    rating: 4.4,
    ratingCount: 7658,
    area: "Church Street",
    address: "39, St Marks Road, Bangalore 560001",
    lat: 12.974,
    lng: 77.6033,
    priceForTwo: 900,
    availabilityStatus: "OPEN",
    hours: "09:00–22:30",
    amenities: ["Heritage seating", "Full bar", "All-day breakfast"],
    deals: ["10% off the total bill"],
    mustTry: ["Mutton Cutlet", "Filter Coffee", "Chicken Stew & Appam"],
    maxPartySize: 10,
  },
  {
    id: "do_11",
    name: "Glen's Bakehouse",
    cuisine: "Cafe · Bakery",
    cuisines: ["Cafe", "Bakery", "Desserts", "Continental"],
    rating: 4.5,
    ratingCount: 5416,
    area: "Church Street",
    address: "23, Lavelle Road, Bangalore 560001",
    lat: 12.9748,
    lng: 77.6068,
    priceForTwo: 700,
    availabilityStatus: "OPEN",
    hours: "08:00–22:00",
    amenities: ["Outdoor seating", "Work friendly", "Dessert counter"],
    deals: ["15% off the bakery counter"],
    mustTry: ["Red Velvet Cake", "Croissant Sandwich"],
    maxPartySize: 6,
  },
  {
    id: "do_12",
    name: "Mahesh Lunch Home",
    cuisine: "Mangalorean · Seafood",
    cuisines: ["Mangalorean", "Seafood", "Coastal"],
    rating: 4.5,
    ratingCount: 6124,
    area: "Jayanagar",
    address: "48, 11th Main, 4th Block, Jayanagar, Bangalore 560011",
    lat: 12.9264,
    lng: 77.5931,
    priceForTwo: 1300,
    availabilityStatus: "OPEN",
    hours: "12:00–23:00",
    amenities: ["Family friendly", "Full bar", "Air conditioned"],
    deals: ["15% off seafood platters"],
    mustTry: ["Neer Dosa & Chicken Sukka", "Prawns Ghee Roast"],
    maxPartySize: 12,
  },
  {
    id: "do_13",
    name: "Vidyarthi Bhavan",
    cuisine: "South Indian",
    cuisines: ["South Indian", "Breakfast", "Vegetarian"],
    rating: 4.6,
    ratingCount: 21470,
    area: "Jayanagar",
    address: "32, Gandhi Bazaar Main Road, Basavanagudi, Bangalore 560004",
    lat: 12.9432,
    lng: 77.5738,
    priceForTwo: 300,
    availabilityStatus: "CLOSED",
    closedReason: "Walk-ins only — this outlet does not take table reservations",
    hours: "06:30–20:00",
    amenities: ["Pure vegetarian", "Heritage"],
    deals: [],
    mustTry: ["Masala Dosa", "Filter Coffee"],
    maxPartySize: 4,
  },
  {
    id: "do_14",
    name: "Windmills Craftworks",
    cuisine: "Brewpub · Jazz",
    cuisines: ["Continental", "Brewpub", "Jazz", "Bar"],
    rating: 4.6,
    ratingCount: 8731,
    area: "Whitefield",
    address: "331, Road 5B, EPIP Zone, Whitefield, Bangalore 560066",
    lat: 12.9591,
    lng: 77.6974,
    priceForTwo: 2200,
    availabilityStatus: "OPEN",
    hours: "12:00–23:00",
    amenities: ["Live jazz", "In-house brewery", "Library", "Valet parking"],
    deals: ["20% off food on live-jazz nights"],
    mustTry: ["Beer-battered Fish", "Craft Lager Flight"],
    maxPartySize: 16,
  },
  {
    id: "do_15",
    name: "Prost Brew Pub",
    cuisine: "German · Brewpub",
    cuisines: ["German", "Brewpub", "European", "Bar"],
    rating: 4.4,
    ratingCount: 3987,
    area: "Whitefield",
    address: "17, ITPL Main Road, Whitefield, Bangalore 560066",
    lat: 12.9716,
    lng: 77.7499,
    priceForTwo: 1600,
    availabilityStatus: "OPEN",
    hours: "12:00–23:00",
    amenities: ["In-house brewery", "Beer garden", "Pet friendly"],
    deals: ["Buy 1 get 1 on craft beer till 8 PM"],
    mustTry: ["Pork Schnitzel", "Hefeweizen"],
    maxPartySize: 12,
  },
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

// --- Dineout lookups ------------------------------------------------------
// Dineout is coordinate-based, so proximity, ranking and availability are all
// derived rather than hardcoded. Everything here is deterministic in its inputs:
// the same search or the same (restaurant, date) always gives the same answer,
// so a demo can be re-run and re-recorded without the numbers moving.

const DINEOUT_SEARCH_RADIUS_KM = 8;
const DINEOUT_RESULT_LIMIT = 6;
const DINEOUT_NEARBY_RADIUS_KM = 5;

export function findDineoutRestaurant(id: string): DineoutRestaurant | undefined {
  return DINEOUT_RESTAURANTS.find((r) => r.id === id);
}

/** Great-circle distance in km. */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** The saved location a lat/lng sits closest to — used to echo back a place name. */
export function nearestSavedLocation(lat: number, lng: number): DineoutLocation {
  return DINEOUT_LOCATIONS.reduce((best, loc) =>
    haversineKm(lat, lng, loc.lat, loc.lng) < haversineKm(lat, lng, best.lat, best.lng) ? loc : best
  );
}

export function defaultSavedLocation(): DineoutLocation {
  return DINEOUT_LOCATIONS.find((l) => l.isDefault) ?? DINEOUT_LOCATIONS[0];
}

// Rough India bounding box. A coordinate outside it is not somewhere we serve, and
// in practice means the caller invented a number instead of reading one out of
// get_saved_locations — 0,0 being the usual one.
const INDIA_BOUNDS = { minLat: 6, maxLat: 37, minLng: 68, maxLng: 98 };

/**
 * The point a search should actually run from. An out-of-area coordinate snaps to
 * the user's default location rather than searching an ocean and returning Bangalore
 * anyway — `snappedFrom` is set so the caller can say it moved the search instead of
 * quietly relocating the user.
 */
export function resolveSearchPoint(
  lat: number,
  lng: number
): { lat: number; lng: number; snappedFrom?: string } {
  const inIndia =
    lat >= INDIA_BOUNDS.minLat &&
    lat <= INDIA_BOUNDS.maxLat &&
    lng >= INDIA_BOUNDS.minLng &&
    lng <= INDIA_BOUNDS.maxLng;
  if (inIndia) return { lat, lng };
  const fallback = defaultSavedLocation();
  return { lat: fallback.lat, lng: fallback.lng, snappedFrom: `${lat}, ${lng}` };
}

export function bookableCountNear(lat: number, lng: number): number {
  return DINEOUT_RESTAURANTS.filter(
    (r) =>
      r.availabilityStatus === "OPEN" &&
      haversineKm(lat, lng, r.lat, r.lng) <= DINEOUT_NEARBY_RADIUS_KM
  ).length;
}

// Words that say nothing about *which* restaurant — matching on them would make
// every query look like a hit.
const QUERY_STOPWORDS = new Set([
  "table", "tables", "book", "booking", "reserve", "reservation", "slot", "slots",
  "tonight", "today", "tomorrow", "evening", "night", "dinner", "lunch",
  "near", "nearby", "around", "close", "place", "places", "spot", "spots",
  "restaurant", "restaurants", "food", "best", "good", "nice", "some", "with",
  "that", "this", "people", "guests", "person", "party",
]);

/** The words in a query that could actually pick one restaurant over another. */
function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !QUERY_STOPWORDS.has(w));
}

function matchesTerms(r: DineoutRestaurant, terms: string[]): boolean {
  const haystack = [r.name, r.area, r.cuisine, ...r.cuisines, ...r.mustTry, ...r.amenities]
    .join(" ")
    .toLowerCase();
  // Any one term is enough — "rooftop asian" shouldn't need both to hit.
  return terms.some((w) => haystack.includes(w));
}

export interface RankedRestaurant {
  restaurant: DineoutRestaurant;
  km: number;
}

/**
 * Restaurants around a point, nearest first, optionally narrowed by a free-text
 * query over name / area / cuisine / dishes / amenities.
 *
 * `queryMatch` says what happened to the query, which is what the caller needs to
 * explain the list: "hit" narrowed it, "miss" matched nothing so the closest places
 * came back instead (the app behaves the same way rather than showing nothing), and
 * "ignored" means the query held no distinguishing words — "a table tonight" says
 * where to look but nothing about which restaurant.
 */
export function rankDineoutRestaurants(
  lat: number,
  lng: number,
  query?: string
): { queryMatch: "hit" | "miss" | "ignored"; ranked: RankedRestaurant[] } {
  const byDistance = DINEOUT_RESTAURANTS.map((restaurant) => ({
    restaurant,
    km: haversineKm(lat, lng, restaurant.lat, restaurant.lng),
  })).sort((a, b) => a.km - b.km);

  const inRadius = byDistance.filter((r) => r.km <= DINEOUT_SEARCH_RADIUS_KM);
  // A query narrows the whole radius; only the response is capped.
  const pool = inRadius.length ? inRadius : byDistance;
  const top = (list: RankedRestaurant[]) => list.slice(0, DINEOUT_RESULT_LIMIT);

  const terms = queryTerms(String(query ?? ""));
  if (terms.length === 0) return { queryMatch: "ignored", ranked: top(pool) };
  const hits = pool.filter((r) => matchesTerms(r.restaurant, terms));
  return hits.length
    ? { queryMatch: "hit", ranked: top(hits) }
    : { queryMatch: "miss", ranked: top(pool) };
}

/** Today in India as YYYY-MM-DD — Dineout is an India-only surface. */
export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const RELATIVE_DATES: Record<string, number> = { today: 0, tonight: 0, tomorrow: 1 };

/**
 * Normalize whatever the model passed as a date. Accepts YYYY-MM-DD, or a word it
 * may have forwarded verbatim ("tonight"). Anything unparseable resolves to today
 * rather than failing the call — a loosely formatted date shouldn't dead-end a
 * booking flow.
 */
export function resolveDate(input: unknown): string {
  const raw = String(input ?? "").trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const day = new Date(`${todayIST()}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + (RELATIVE_DATES[raw] ?? 0));
  return day.toISOString().slice(0, 10);
}

const SLOT_BANDS: { startTime: string; band: string }[] = [
  { startTime: "12:30", band: "Lunch" },
  { startTime: "13:30", band: "Lunch" },
  { startTime: "19:00", band: "Early dinner" },
  { startTime: "19:30", band: "Early dinner" },
  { startTime: "20:00", band: "Dinner" },
  { startTime: "20:30", band: "Dinner" },
  { startTime: "21:00", band: "Dinner" },
  { startTime: "21:30", band: "Late night" },
  { startTime: "22:30", band: "Late night" },
];

/** FNV-1a: a stable per-(restaurant, date) seed, so a day's table plan never moves. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** "HH:MM" string compare is safe here — every restaurant closes before midnight. */
function withinHours(r: DineoutRestaurant, startTime: string): boolean {
  const [open, close] = r.hours.split("–");
  return startTime >= open && startTime <= close;
}

/**
 * One restaurant's table plan for one date. Exactly two bands are premium (a paid
 * hold, which v1 refuses) and the rest are free, so there is always a free slot
 * left to book — a demo can't dead-end on an unlucky seed.
 */
export function slotsFor(
  r: DineoutRestaurant,
  date: string,
  guestCount: number
): DineoutSlot[] {
  const seed = hash(`${r.id}|${date}`);
  const open = SLOT_BANDS.filter((b) => withinHours(r, b.startTime));
  if (open.length === 0) return [];
  const premiumA = seed % open.length;
  // Offset by 3: distinct from premiumA for every band count in this catalog (5+).
  const premiumB = (premiumA + 3) % open.length;

  return open.flatMap((b, i) => {
    // Big parties need tables joined, so a few bands are already gone.
    if (guestCount > 4 && (seed + i) % 4 === 0) return [];
    const isFree = i !== premiumA && i !== premiumB;
    const offer = r.deals.length ? r.deals[(seed + i) % r.deals.length] : undefined;
    return [
      {
        slotId: `slot_${b.startTime.replace(":", "")}`,
        startTime: b.startTime,
        band: b.band,
        guestCount,
        isFree,
        ...(isFree ? (offer ? { offer } : {}) : { bookingFee: 200 + ((seed + i) % 3) * 100 }),
      },
    ];
  });
}
