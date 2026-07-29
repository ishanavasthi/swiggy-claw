# Implementation

Status as of 2026-07-30.

## What is built

**Agent loop.** One streaming completion per round, round-capped at 8. Tool-call deltas are
accumulated by index and parsed once at the end of the round, so partial names and split JSON
arguments never get interpreted mid-stream. Assistant and tool messages stay 1:1 paired.
Streamed text is stored verbatim so the saved history matches what the user actually saw.
Tool names are sanitized and validated against the offered tool list before routing; after
two unknown-name strikes the loop stops offering tools so the turn ends in text.

**Guard layer.** Sits between the loop and the MCP router. Enforces the ₹1,000 food-cart cap
by reading the cart before `place_food_order`. Wraps `place_food_order` and Instamart
`checkout` in check-then-retry against their respective order lists. `book_table` is called
directly — no list endpoint exists to verify against. Guards return ordinary failed tool
results rather than editing history.

**MCP layer.** Three clients, one per surface, cached per token so there is no re-handshake
per request. A router dispatches by tool name via a name → server map built at tool-load time
(duplicate names are rejected at load, since the flat tool list needs globally unique names).
MCP results are normalized from text content blocks into plain objects, with protocol-level
errors folded into the same `{ success, error }` envelope the domain uses.

**Mock backend (default).** A real MCP `Server` per surface over an in-memory transport,
serving **28 tools** — 13 Food, 9 Instamart, 6 Dineout. This is the default; the real
StreamableHTTP path is wired and switches on `SWIGGY_USE_MOCK=false` plus a bearer token, but
has never been exercised against live Swiggy servers.

**Auth.** iron-session cookie session. In mock mode `requireAuth` mints a dev token so the
whole flow runs without credentials; in real mode it requires a stored, unexpired Swiggy
token and 401s otherwise.

**LLM providers.** NVIDIA NIM (default, `deepseek-ai/deepseek-v4-pro`) and Groq
(`llama-3.3-70b-versatile`), both through the `openai` SDK. Provider is inferred from
whichever key is present unless `LLM_PROVIDER` says otherwise; `LLM_MODEL` overrides the
default. A non-secret provider snapshot is surfaced to the UI footer.

**Chat UI.** Single client component with a Zustand store holding both the render timeline
and the flat API history. Streaming bubbles, tool cards with executing/resolved/error states,
per-surface mode steering (food / groceries / dineout), a Recent list of archived
conversations, and markdown via `react-markdown` + `remark-gfm`. Persistence is localStorage
at schema v3, with migrations from v2 and v1.

**Benchmarks.** `scripts/bench-nvidia.ts` (single-shot routing across candidate models) and
`scripts/bench-loop.ts` (runs the real orchestrator per model as a multi-round tiebreak), both
against the real tool schemas. `scripts/try-loop.ts` exercises the mock servers, the guard
layer, the cap, and idempotency without needing the UI.

## Integrations

| Piece | Choice | Note |
|---|---|---|
| LLM | NVIDIA NIM (default) / Groq | one `openai` client, provider varies baseURL+key+model |
| Tools | `@modelcontextprotocol/sdk` | MCP `inputSchema` is valid JSON Schema, passed through verbatim |
| Backend | in-process mock MCP | real StreamableHTTP adapter behind the same interface |
| UI | Next.js App Router, Radix/shadcn, Tailwind v4 | Base UI removed |
| State | Zustand + localStorage v3 | timeline + flat history |
| Session | iron-session | mock mode mints a dev token |

## Milestones

- [x] Mock MCP backend, 3 servers / 28 tools
- [x] Streaming tool loop with SSE to the UI
- [x] Guard layer: cart cap, check-then-retry, COD-only discipline
- [x] Provider abstraction + model benchmarking
- [x] Frontend integrated on real store/SSE flow
- [x] Conversation sessions in the Recent list
- [x] Tool-name sanitization and unknown-tool containment
- [ ] Real Swiggy MCP — blocked on invited access
- [ ] Nutrition / health agent — blocked on missing menu nutrition data
- [ ] Preference memory — blocked on no special-request field in the manifest

## Known rough edges

- Several Groq-era names survive the provider switch (`loadAllGroqTools`,
  `mcpToolToGroqTool`, "Groq loop" in comments and the README diagram). Cosmetic, but
  misleading to a new reader given NVIDIA is now the default.
- `groq-sdk` is still a declared dependency though the orchestrator no longer uses it.
- Real-backend code paths are untested end-to-end for lack of access.
