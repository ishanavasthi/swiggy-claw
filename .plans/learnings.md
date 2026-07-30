# Learnings

Running log, newest first.

## 2026-07-30 — The agent forgot every tool it had ever called

**What changed.** Turns now carry their tool calls, not just their text. The store records
each turn's calls and results on the assistant `ChatMessage`; `buildHistoryFromMessages`
expands them back into paired assistant/tool messages. Cart snapshots superseded by a later
call to the same tool are replaced with a marker instead of replayed. The location rule in
the system prompt no longer gates tools that take no location.

**Why.** Reported as "Instamart is broken": asked for go-to grocery items, the agent listed
addresses, asked which one, and then asked again, and again — finally claiming it had no tool
to fetch Instamart items, which it plainly did. Nothing was wrong with Instamart. History was
rebuilt as text only, so every request started blind. The agent re-resolved the address each
turn, had nothing to bind a bare "yes" to, and eventually confabulated its way to denying a
tool it had been handed. The prompt made it worse by requiring an address before
`your_go_to_items`, which takes no arguments at all, so the very first turn stalled on a
question it never needed to ask.

**Gotcha.** Replaying tool results fixed the loop and immediately introduced a subtler bug:
with the whole history visible, the agent added bread to a cart that `checkout` had already
emptied and reported the old items plus the new one. An order confirmation stays true
forever; a cart listing stops being true the moment anything touches it. Replaying both
kinds the same way is what merged them.

**Takeaway.** The symptom named a surface, the cause was in the transport. When an agent
claims it cannot do something it has a tool for, suspect its context before its tools — that
sentence is what confabulation looks like after a few turns of amnesia. And when adding
memory, sort facts from snapshots: more context is only better if what is in it is still true.

## 2026-07-30 — Leaked model control tokens in tool names

**What changed.** Tool names coming off the stream are now sanitized once fully accumulated
(control tokens stripped, a `functions.` namespace prefix removed) and validated against the
offered tool list before routing. An unroutable name returns a clear failed result to the
model instead of reaching the MCP layer, and after two unknown-tool strikes the loop stops
offering tools so the turn ends in text.

**Why.** NVIDIA NIM serving `openai/gpt-oss-*` leaks Harmony channel markers into the
streamed `function.name`, so a call arrived as `your_go_to_items<|channel|>commentary`. The
lookup missed, the MCP router rejected it, and the model re-emitted the identical call every
round until the 8-round cap was exhausted — seven identical failed tool cards for one user
request.

**Gotcha.** The failure looked domain-specific because it surfaced on an Instamart tool. It
was model-format-specific and could have hit any tool on any surface. Also worth recording:
the exposure was self-inflicted — the faster model picked for demo pacing is what introduced
it. The default `deepseek-v4-pro` does not use the Harmony format and never hit this.

**Takeaway.** Treat the model's tool name as untrusted input, exactly like its arguments.
Validate before dispatch, and give a confused model a bounded number of chances before taking
the tools away — otherwise one malformed name eats the entire turn.

## 2026-07-30 — Recent sidebar grouped by conversation

**What changed.** Added conversation sessions to the store: "New chat" archives the live
conversation instead of erasing it, archived conversations can be re-opened, and persistence
moved to v3 with migrations from v2 and v1. The Recent list is now one row per conversation.

**Why.** The list was rendering one row per user message. The root cause was below the UI —
the store had no conversation entity to group by. It held one continuous timeline, and reset
simply threw it away.

**Gotcha.** The symptom was cosmetic, the fix was a data-model change plus a storage
migration. Fixing it in the rendering layer would have produced grouped-looking rows over
data that still could not survive a reset.

**Takeaway.** When a list renders the wrong unit, check whether the right unit exists in the
model at all before reaching for the render code.

## 2026-07-29 — Switched LLM provider to NVIDIA NIM, provider-abstracted

**What changed.** Orchestrator moved from `groq-sdk` to the `openai` SDK behind a small
provider module selectable by env var. NVIDIA NIM is the default with
`deepseek-ai/deepseek-v4-pro`; Groq remains one env var away.

**Why.** `groq-sdk` cannot be pointed at NIM — it hardcodes `/openai/v1/chat/completions`,
which NVIDIA answers with a 404. Both providers speak the OpenAI wire format, so a single
client covers both. Model choice was benchmarked against the real 28-tool schema set:
single-shot routing tied four models at 3/3, so a multi-round loop test broke the tie —
`deepseek-v4-pro` chained addresses → search → menu (~40s) while the 5x faster
`openai/gpt-oss-20b` stopped after one hop (~8s).

**Gotcha.** Two of them. First, several catalogue models are simply unusable:
`meta/llama-3.3-70b-instruct` and `openai/gpt-oss-120b` hang indefinitely; `kimi-k2.6` and
`mistral-large-2-instruct` 404; `qwen3-next-80b` returns 410 Gone. Second, and worse: the
first benchmark scored every model 1/3 and looked damning, but the fault was in the grading
rubric, which was guessing at tool names. Fixing the rubric against the real names changed
the ranking completely.

**Takeaway.** Benchmark against the real schemas, and distrust a benchmark where everything
fails equally — that is a signal about the harness, not the subjects. Also: a single-shot
routing score does not predict multi-round chaining, which is the capability this agent
actually needs.

## 2026-07-28 / 2026-07-29 — Integrated the v0.dev-generated frontend

**What changed.** Replaced every mock in the generated UI with the real store and SSE flow.
Standardised on Radix and dropped Base UI. Swapped the generated markdown parser for
`react-markdown` + `remark-gfm`, styled to match.

**Why.** The generated UI was a single ~1160-line component with entirely mocked data and a
fake `setInterval` "streaming" loop. It also assumed Radix/shadcn conventions (`asChild`,
`variant`, `size`) while the app's primitives were Base UI — moving the handful of existing
primitives was a smaller diff than rewriting the generated UI. The hand-rolled markdown
parser handled only bold, code, and tables, and mangled the lists, headings, and code blocks
that real LLM output contains.

**Gotcha.** The generated CSS used `bg-accent-muted` nine times but never registered
`--color-accent-muted` in Tailwind v4's `@theme` block, so every accent-tinted surface
silently rendered flat. A class that generates nothing produces no error anywhere.

**Takeaway.** Generated UI is a layout and a look, not an integration. Budget for replacing
its data layer wholesale, and specifically audit whether its custom design tokens were ever
registered — missing tokens fail silently, which is the expensive kind.

## Ongoing — the safety guard layer

**What it is.** A ₹1,000 food-cart cap enforced in code before `place_food_order`;
check-then-retry on `place_food_order` and Instamart `checkout` so a lost response verifies
against the order list instead of double-charging; COD-only discipline (coupons requiring
online payment are refused); address scoping enforced per surface (Dineout uses lat/lng, Food
and Instamart use `addressId`).

**Why.** Swiggy's published manifest states MCP orders are cash-on-delivery and cannot be
cancelled. There is no undo, so every guard has to hold before the call, not after.

**Gotcha.** `book_table` is deliberately *not* retried. The mock has no bookings-list endpoint
to verify a lost response against, and a blind retry could double-book. The safe-looking
symmetry of "retry all the non-idempotent tools" would have been the bug.

**Takeaway.** The cap lives in code, not in the prompt, because a model can talk itself out of
a prompt rule but cannot reach a pre-call guard. And check-then-retry is only safe where a
check exists — where it does not, failing visibly beats retrying blindly.
