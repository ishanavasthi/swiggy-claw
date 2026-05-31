# Swiggy Claw — AI Ordering Agent

Natural-language agent for food ordering, groceries, and table booking via Swiggy's MCP
platform, with **Groq** as the LLM. Next.js 16 (App Router) + `groq-sdk` (OpenAI-compatible
tool loop) + `@modelcontextprotocol/sdk` over an in-process **mock MCP server** (3 servers,
28 tools) that mirrors Swiggy's documented shape. A real StreamableHTTP adapter drops in
behind the same interface if/when invited access is granted.

> Swiggy MCP is real (mcp.swiggy.com/food, /im, /dineout) but **invite-only and currently
> disallows third-party apps**, so this builds **mock-first**. See `SWIGGY_USE_MOCK`.

## Setup

```bash
npm install
# .env.local already has placeholders — set GROQ_API_KEY (free: https://console.groq.com)
npm run dev          # http://localhost:3000
```

`.env.local` keys:

| Var | Purpose |
|---|---|
| `GROQ_API_KEY` | Groq key (required for live turns) |
| `GROQ_MODEL_TOOLS` | `llama-3.3-70b-versatile` (reliable tool calling) |
| `SWIGGY_USE_MOCK` | `true` (default). `false` needs invited Swiggy creds |
| `SWIGGY_ENABLED_SERVERS` | `food` (lean) … omit for all 3. Controls how many tool schemas enter each request |
| `SESSION_SECRET` | 64-char hex for iron-session |

## ⚠️ Groq free-tier reality (important)

Each agent turn sends **all enabled tool schemas** in every request. Full 3-server mode is
~7.1k tokens/request; food-only is ~6.5k.

- **`llama-3.3-70b-versatile`**: 30 RPM / 12k TPM / **100k tokens-per-DAY**. ≈14 full turns/day
  before the daily token cap → 1h+ reset. This is the binding limit, not RPM.
- **`llama-3.1-8b-instant`**: 6k TPM — a single full request is **too large** (413) and 8b is
  weaker at tool calls. Not recommended for this agent on free tier.

Levers: keep `SWIGGY_ENABLED_SERVERS=food` for the slice, or upgrade to Groq's Dev tier.
On a 429/413 the UI shows a rate-limit notice (it does not silently hang).

## Verify without the UI

```bash
npx tsx scripts/try-loop.ts
```

Exercises the mock servers, the guard layer, the ₹1000 cap, and check-then-retry idempotency
(no Groq calls unless `GROQ_API_KEY` is set, which also runs one live agent turn).

## Architecture

```
Chat UI (app/page.tsx, Zustand)
   │ POST /api/chat (SSE)
   ▼
route.ts  → runAgentStream (lib/agent/orchestrator.ts)  single streaming Groq loop
   ▼
buildCallMCPTool (lib/agent/guards.ts)  pre-call cap guard + safePlaceOrder
   ▼
callTool router (lib/swiggy/mcp-client.ts)  → food | im | dineout Client
   ├── mock in-process MCP (lib/swiggy/mock/*)   ← default
   └── StreamableHTTP transport (real)           ← when invited
```

Key correctness choices: tool-call deltas accumulated by index then parsed once (empty args →
`{}`); assistant/tool messages kept 1:1 paired; guards never splice synthetic tool messages;
streamed text stored verbatim so history matches what the user saw.
