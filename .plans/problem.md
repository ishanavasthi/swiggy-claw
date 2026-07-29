# Problem

Swiggy Claw is a natural-language agent that orders food, buys groceries, and books
restaurant tables across Swiggy's three MCP surfaces (Food, Instamart, Dineout). Built for
the Swiggy Builders Club.

## The problem

Ordering on Swiggy is a multi-step, multi-surface chore: resolve an address, search, open a
menu, build a cart, check coupons, confirm, place. Each surface has its own vocabulary and
its own idea of "where you are". A user who knows what they want still has to drive the
whole funnel by hand.

Swiggy exposes these surfaces over MCP, which makes an agent possible — but an agent that
spends real money on someone's behalf has to be *correct*, not just fluent. The interesting
problem is not "call a tool"; it is doing the full chain reliably and refusing to do the
wrong thing.

## Goals

- One conversation drives the whole flow across all three surfaces.
- The agent never places, checks out, or books without an explicit user confirmation.
- Financial and ordering mistakes are prevented in code, not asked for in the prompt.
- Everything is demonstrable end-to-end without invited API access.

## Scope

**In scope (v1).** Food delivery, Instamart groceries, Dineout table booking; a streaming
chat UI with a visible tool timeline; a safety guard layer; a mock MCP backend that mirrors
the documented shape, with a real adapter behind the same interface.

**Out of scope (v1).** Online payments. Order cancellation. Nutrition/health filtering. A
persistent user-preference memory.

## Constraints

- **Invite-only MCP.** The real servers (`mcp.swiggy.com/food`, `/im`, `/dineout`) are
  invite-only and currently disallow third-party apps. The project is therefore mock-first:
  an in-process mock MCP server (3 servers, 28 tools) is the default, and a StreamableHTTP
  adapter sits behind the same `Client` interface for when access is granted.
- **Cash on delivery, and orders cannot be cancelled.** Per Swiggy's published manifest, MCP
  orders are COD and there is no cancellation path. There is no undo, which is the whole
  reason the guard layer exists rather than being a nice-to-have. Coupons that require online
  payment are refused.
- **A ₹1,000 cap on food carts.** A hard ceiling on how much damage a wrong order can do.
- **Address models differ per surface.** Dineout works in lat/lng; Food and Instamart work in
  `addressId`. Crossing them is a silent wrong-answer class of bug.
- **Free-tier LLM budgets.** Every turn ships all enabled tool schemas (~7.1k tokens for all
  three servers). On Groq's free tier the daily token cap binds well before the request rate
  does, so the number of enabled servers is a deliberate lever.

## Naming

Renamed from "NutriCart AI". The original pitch was a health/nutrition filter on top of
ordering, but the ordering agent underneath turned out to be the harder and more valuable
problem, so that was built first. Nutrition is deferred to a later layer — see `approach.md`.
