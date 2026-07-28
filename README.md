# Swiggy Claw - AI Ordering Agent

Natural-language agent for food ordering, groceries, and table booking via Swiggy's MCP
platform, with **NVIDIA NIM** as the default LLM provider (Groq supported via one env var). Next.js 16 (App Router) + the `openai` SDK (OpenAI-compatible
tool loop) + `@modelcontextprotocol/sdk` over an in-process **mock MCP server** (3 servers,
28 tools) that mirrors Swiggy's documented shape. A real StreamableHTTP adapter drops in
behind the same interface if/when invited access is granted.

> Swiggy MCP is real (mcp.swiggy.com/food, /im, /dineout) but **invite-only and currently
> disallows third-party apps**, so this builds **mock-first**. See `SWIGGY_USE_MOCK`.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then set NVIDIA_API_KEY
npm run dev                        # http://localhost:3000
```

`.env.local` keys:

| Var                      | Purpose                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `LLM_PROVIDER`           | `nvidia` (default) or `groq`. Inferred from whichever key is set                    |
| `NVIDIA_API_KEY`         | NVIDIA NIM key (free: https://build.nvidia.com)                                    |
| `GROQ_API_KEY`           | Groq key, only when `LLM_PROVIDER=groq`                                            |
| `LLM_MODEL`              | Overrides the provider default (see model notes below)                             |
| `SWIGGY_USE_MOCK`        | `true` (default). `false` needs invited Swiggy creds                               |
| `SWIGGY_ENABLED_SERVERS` | `food` (lean) … omit for all 3. Controls how many tool schemas enter each request  |
| `SESSION_SECRET`         | 64-char hex for iron-session                                                       |

Both providers speak the OpenAI wire format, so one `openai` client serves both —
only baseURL/key/model differ (`lib/agent/provider.ts`). Note `groq-sdk` cannot be
pointed at NIM: it hardcodes `/openai/v1/chat/completions`, which NVIDIA 404s.

## Model selection (NVIDIA NIM)

Benchmarked against the real 28 mock-MCP tool schemas:
`npx tsx scripts/bench-nvidia.ts` (routing) and `scripts/bench-loop.ts` (full loop).

| Model                              | Routing | Multi-round chain | Turn latency |
| ---------------------------------- | ------- | ----------------- | ------------ |
| `deepseek-ai/deepseek-v4-pro` **(default)** | 3/3 | ✅ full chain | ~40s |
| `nvidia/nvidia-nemotron-nano-9b-v2`| 3/3     | ✅ full chain     | ~57s         |
| `openai/gpt-oss-20b`               | 3/3     | ❌ stops after 1 hop | ~8s      |
| `nvidia/nemotron-3-ultra-550b-a55b`| 3/3     | ❌ stops after 1 hop | ~31s     |

Set `LLM_MODEL=openai/gpt-oss-20b` if you want speed over chain reliability.
Several catalogue models are unusable: `meta/llama-3.3-70b-instruct` and
`openai/gpt-oss-120b` hang indefinitely; `moonshotai/kimi-k2.6` and
`mistralai/mistral-large-2-instruct` 404; `qwen/qwen3-next-80b-a3b-instruct` is 410 Gone.

## ⚠️ Groq free-tier reality (only when `LLM_PROVIDER=groq`)

Each agent turn sends **all enabled tool schemas** in every request. Full 3-server mode is
~7.1k tokens/request; food-only is ~6.5k.

- **`llama-3.3-70b-versatile`**: 30 RPM / 12k TPM / **100k tokens-per-DAY**. ≈14 full turns/day
  before the daily token cap → 1h+ reset. This is the binding limit, not RPM.
- **`llama-3.1-8b-instant`**: 6k TPM - a single full request is **too large** (413) and 8b is
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
Chat UI (components/swiggy-agent.tsx, Zustand timeline store)
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
