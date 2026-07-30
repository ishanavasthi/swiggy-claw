# Approach

## Shape

A Next.js App Router app. The chat UI POSTs to a single SSE endpoint; that endpoint runs one
streaming tool loop against an OpenAI-compatible LLM, and every tool call passes through a
guard layer before it reaches an MCP client. Three MCP clients (Food, Instamart, Dineout) sit
behind a router that dispatches by tool name.

```
Chat UI (Zustand timeline store)
  → POST /api/chat (SSE)
  → runAgentStream            streaming tool loop, round-capped
  → buildCallMCPTool          pre-call guards + check-then-retry
  → callTool router           food | instamart | dineout
       ├── in-process mock MCP  (default)
       └── StreamableHTTP       (real, when invited)
```

## Key decisions

**Mock-first, same interface.** The mock is a real MCP `Server` connected over an in-memory
transport, not a stub function table. The returned `Client` is API-identical to a
StreamableHTTP one, so the agent code path is byte-for-byte the same under mock and real. The
alternative — stubbing at the `callTool` boundary — would have been faster to write and would
have hidden every protocol-level bug until the day access was granted.

**Guards in code, not in the prompt.** The ₹1,000 food-cart cap is enforced by reading the
cart and short-circuiting *before* `place_food_order` runs. A model can be argued out of a
prompt rule; it cannot reach past a pre-call guard. The system prompt still states the rule,
but as user-facing etiquette (warn early), not as the enforcement mechanism.

**Guards are out-of-band.** When a guard refuses, it returns an ordinary failed tool result
the model can read and react to. It never splices synthetic assistant/tool messages into the
history. Faking turns is how histories drift out of 1:1 pairing and later requests start
getting rejected.

**Check-then-retry, selectively.** `place_food_order` and Instamart `checkout` are
non-idempotent, so on a 5xx (where the response may simply have been lost) they wait, re-read
the order list, and return the existing order if one appeared — otherwise retry once.
`book_table` is deliberately *not* wrapped: the mock has no bookings-list endpoint to verify
against, and a blind retry could double-book. An unverifiable retry is worse than a visible
failure. A real adapter should add the check function and then wrap it.

**Provider abstraction over the OpenAI wire format.** `groq-sdk` cannot be pointed at NVIDIA
NIM — it hardcodes `/openai/v1/chat/completions`, which NVIDIA answers with a 404. Since both
providers speak the same wire format, the orchestrator uses the `openai` SDK and a small
provider module that varies only baseURL, key env var, and default model. Switching providers
is one env var.

**Reliability over latency in the default model.** Model choice was benchmarked against the
real 28-tool schema set, not a toy schema. Single-shot routing tied four models at 3/3, so
the tiebreak was a multi-round loop test: `deepseek-ai/deepseek-v4-pro` chained
addresses → search → menu, while models 5x faster stopped after one hop. This agent's whole
value is the chain, so the default is the reliable one and the fast one is one env var away.

**Tool schemas are the token budget.** Every request carries all enabled tool schemas.
`SWIGGY_ENABLED_SERVERS` exists so a demo can run the lean food-only slice instead of paying
for all three surfaces on every turn.

**Model output is untrusted input.** A tool name off the wire is sanitized (control tokens,
`functions.` namespace prefixes) and then validated against the tool list before routing. An
unknown name returns a plain error result to the model rather than reaching the MCP layer,
and repeated unknowns stop the loop offering tools at all, so a confused model ends its turn
in text instead of burning every round on the same failure.

**Two models in the client store, on purpose.** A `timeline` that preserves the
text → tool → text interleaving of one agent turn (what the UI draws), and a flat `messages`
history of one entry per turn (what gets POSTed back). Trying to serve both from one array
means the UI loses tool placement.

**History carries tool calls, not just text.** Each finalized turn records the tools it ran
alongside its prose, and the server expands those records back into paired assistant/tool
messages. Text alone is not enough state to continue on: a turn that resolved an `addressId`
or built a cart leaves none of that in what it said, so the next request would start blind
and re-derive it. Pairing is safe by construction — the `tool_calls` array and its results
are emitted from one filtered list, so neither side can dangle — and call ids are re-scoped
per turn because providers reuse them. Results from tools that snapshot mutable state (the
cart tools) are superseded by their own later calls rather than replayed, since a stale cart
in context invites the model to merge it with the live one.

**Radix, not Base UI.** The generated frontend assumed Radix/shadcn conventions (`asChild`,
`variant`, `size`) while the app's existing primitives were Base UI. Rewriting the generated
UI to Base UI was more work than moving the handful of existing primitives to Radix, so the
project standardised on Radix and dropped Base UI.

**Real markdown rendering.** The generated UI shipped a hand-rolled parser handling bold,
code, and tables. Real LLM output contains lists, headings, and code blocks, which it
mangled, so it was replaced with `react-markdown` + `remark-gfm` styled to match the original
look.

## Alternatives considered

- **Wait for invited MCP access.** Rejected: it makes the project undemonstrable and blocks
  all the interesting correctness work, which is backend-agnostic anyway.
- **Enforce the cart cap in the system prompt only.** Rejected: unenforceable.
- **Retry every non-idempotent tool uniformly.** Rejected: without a way to verify, a retry is
  a coin-flip on double-charging the user.
- **Keep `groq-sdk` and add a second client for NVIDIA.** Rejected: two SDKs to maintain for
  one wire format.
- **Rewrite the generated UI to Base UI.** Rejected: larger diff, no benefit.

## Deferred (not built)

- **Nutrition / health agent** layered alongside the ordering agent — the original pitch.
  Blocked in part because the published manifest documents no nutrition or macro data on menu
  items.
- **Preference memory** across sessions. Related blocker: the manifest documents no
  cooking-instructions or special-request field on a cart item or order, so a remembered
  preference like "no onions" has nowhere to land.
