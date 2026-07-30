"use client";

import { create } from "zustand";
import type {
  AgentMode,
  ChatMessage,
  Conversation,
  TimelineItem,
  TimelineMessage,
  ToolCallRecord,
  ToolStatus,
} from "@/types/agent";

/**
 * Two parallel models live here:
 *
 *  - `timeline`  the ordered render model. Preserves text → tool → text
 *                interleaving inside a single agent turn, which is what the UI
 *                draws (bubbles with tool cards positioned between them).
 *  - `messages`  the flat API history POSTed back to /api/chat. One entry per
 *                turn: the folded text plus the tool calls that ran during it.
 *                The server's `buildHistoryFromMessages` expands those records
 *                back into paired assistant/tool messages.
 */

const STORAGE_KEY = "swiggy-claw-chat-v3";
const LEGACY_V2_KEY = "swiggy-claw-chat-v2";
const LEGACY_MESSAGES_KEY = "swiggy-claw-messages";

/** How many finished conversations to keep in the Recent list. */
const MAX_ARCHIVED = 20;

interface PersistedShape {
  version: 3;
  conversationId: string;
  messages: ChatMessage[];
  timeline: TimelineItem[];
  /** Finished conversations, newest first. The live one is not in here. */
  conversations: Conversation[];
  mode: AgentMode;
}

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- timeline reducer helpers ----------------------------------------------

function isOpenAssistant(item: TimelineItem | undefined): item is TimelineMessage {
  return (
    !!item && item.kind === "message" && item.role === "assistant" && item.streaming === true
  );
}

/**
 * Close the trailing streaming assistant bubble. A bubble that never produced
 * any text (the "thinking" skeleton) is dropped entirely so a tool card can
 * take its place instead of leaving an empty bubble behind.
 */
function closeOpenAssistant(timeline: TimelineItem[]): TimelineItem[] {
  const last = timeline[timeline.length - 1];
  if (!isOpenAssistant(last)) return timeline;
  if (!last.content) return timeline.slice(0, -1);
  return [...timeline.slice(0, -1), { ...last, streaming: false, loading: false }];
}

/** Push a fresh "thinking" assistant bubble unless one is already open. */
function openAssistant(timeline: TimelineItem[]): TimelineItem[] {
  if (isOpenAssistant(timeline[timeline.length - 1])) return timeline;
  return [
    ...timeline,
    {
      kind: "message",
      id: uid("a"),
      role: "assistant",
      content: "",
      streaming: true,
      loading: true,
    } satisfies TimelineMessage,
  ];
}

/** A failed SwiggyToolResponse (or the orchestrator's error envelope). */
function statusForResult(result: unknown): ToolStatus {
  if (result && typeof result === "object" && (result as { success?: unknown }).success === false) {
    return "error";
  }
  return "resolved";
}

function errorMessageForResult(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const err = (result as { error?: unknown }).error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return undefined;
}

// --- conversations ----------------------------------------------------------

/** Title a conversation by its opening user message. */
export function conversationTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user" && m.content.trim());
  const raw = first?.content.trim().replace(/\s+/g, " ") ?? "New conversation";
  return raw.length > 60 ? `${raw.slice(0, 59)}…` : raw;
}

/** A conversation counts as real once the user has actually said something. */
function hasContent(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === "user" && m.content.trim().length > 0);
}

function snapshot(
  id: string,
  messages: ChatMessage[],
  timeline: TimelineItem[]
): Conversation {
  const last = messages[messages.length - 1];
  return {
    id,
    title: conversationTitle(messages),
    messages,
    timeline,
    updatedAt: last?.ts ?? Date.now(),
    messageCount: messages.filter((m) => m.role === "user").length,
  };
}

/**
 * Move the live conversation into the archive, newest first. Empty
 * conversations are dropped rather than archived, and re-archiving the same id
 * replaces the older copy instead of duplicating it.
 */
function archiveCurrent(s: ChatState): Conversation[] {
  if (!hasContent(s.messages)) return s.conversations;
  const rest = s.conversations.filter((c) => c.id !== s.conversationId);
  return [snapshot(s.conversationId, s.messages, s.timeline), ...rest].slice(0, MAX_ARCHIVED);
}

// --- persistence ------------------------------------------------------------

type Persistable = Pick<
  ChatState,
  "conversationId" | "messages" | "timeline" | "conversations" | "mode"
>;

function persist(state: Persistable) {
  if (typeof window === "undefined") return;
  try {
    const blob: PersistedShape = {
      version: 3,
      conversationId: state.conversationId,
      messages: state.messages,
      timeline: state.timeline,
      conversations: state.conversations,
      mode: state.mode,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  } catch {
    /* ignore quota errors */
  }
}

/** Best-effort migration of the v1 payload (a bare ChatMessage[]). */
function readLegacy(): { messages: ChatMessage[]; timeline: TimelineItem[] } | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_MESSAGES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const messages = parsed.filter(
      (m): m is ChatMessage =>
        !!m && typeof m === "object" && typeof m.content === "string" && (m.role === "user" || m.role === "assistant")
    );
    const timeline: TimelineItem[] = messages
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ kind: "message", id: uid("m"), role: m.role, content: m.content }));
    return { messages, timeline };
  } catch {
    return null;
  }
}

// --- store ------------------------------------------------------------------

interface ChatState {
  /** Id of the live conversation (never present in `conversations`). */
  conversationId: string;
  messages: ChatMessage[];
  timeline: TimelineItem[];
  /** Finished conversations, newest first. */
  conversations: Conversation[];
  isStreaming: boolean;
  /** false once the backend has reported a 401 (Swiggy session expired). */
  connected: boolean;
  mode: AgentMode;
  hydrated: boolean;

  hydrate: () => void;
  setMode: (mode: AgentMode) => void;
  setConnected: (v: boolean) => void;
  setStreaming: (v: boolean) => void;

  addUserMessage: (text: string) => void;
  beginAssistant: () => void;
  appendAssistantDelta: (delta: string) => void;
  addToolCall: (rec: { id: string; name: string; args: unknown }) => void;
  resolveToolCall: (id: string, result: unknown) => void;
  finaliseAssistantMessage: () => void;
  abortAssistant: () => void;
  /** Archive the live conversation and start an empty one. */
  reset: () => void;
  /** Re-open an archived conversation, archiving the live one first. */
  selectConversation: (id: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversationId: uid("c"),
  messages: [],
  timeline: [],
  conversations: [],
  isStreaming: false,
  connected: true,
  mode: "food",
  hydrated: false,

  hydrate: () => {
    if (typeof window === "undefined" || get().hydrated) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const blob = JSON.parse(raw) as Partial<PersistedShape>;
        if (blob && blob.version === 3 && Array.isArray(blob.messages) && Array.isArray(blob.timeline)) {
          set({
            conversationId: blob.conversationId ?? uid("c"),
            messages: blob.messages,
            timeline: blob.timeline,
            conversations: Array.isArray(blob.conversations) ? blob.conversations : [],
            mode: blob.mode ?? "food",
            hydrated: true,
          });
          return;
        }
      }
      // v2 had a single unnamed conversation — adopt it as the live one.
      const v2raw = window.localStorage.getItem(LEGACY_V2_KEY);
      if (v2raw) {
        const blob = JSON.parse(v2raw) as { messages?: ChatMessage[]; timeline?: TimelineItem[]; mode?: AgentMode };
        if (Array.isArray(blob?.messages) && Array.isArray(blob?.timeline)) {
          const migrated = {
            conversationId: uid("c"),
            messages: blob.messages,
            timeline: blob.timeline,
            conversations: [] as Conversation[],
            mode: blob.mode ?? ("food" as AgentMode),
          };
          set({ ...migrated, hydrated: true });
          window.localStorage.removeItem(LEGACY_V2_KEY);
          persist(migrated);
          return;
        }
      }
      const legacy = readLegacy();
      if (legacy) {
        set({ ...legacy, hydrated: true });
        window.localStorage.removeItem(LEGACY_MESSAGES_KEY);
        persist({ ...legacy, conversationId: get().conversationId, conversations: [], mode: get().mode });
        return;
      }
    } catch {
      /* corrupt payload — start clean rather than crash */
    }
    set({ hydrated: true });
  },

  setMode: (mode) => {
    set({ mode });
    const s = get();
    persist({ conversationId: s.conversationId, messages: s.messages, timeline: s.timeline, conversations: s.conversations, mode });
  },

  setConnected: (connected) => set({ connected }),

  setStreaming: (isStreaming) => set({ isStreaming }),

  // --- event -> timeline reducer --------------------------------------------

  addUserMessage: (text) => {
    const s = get();
    const messages: ChatMessage[] = [...s.messages, { role: "user", content: text, ts: Date.now() }];
    const timeline: TimelineItem[] = [
      ...closeOpenAssistant(s.timeline),
      { kind: "message", id: uid("u"), role: "user", content: text },
    ];
    set({ messages, timeline });
    persist({ conversationId: s.conversationId, messages, timeline, conversations: s.conversations, mode: s.mode });
  },

  beginAssistant: () => set({ timeline: openAssistant(get().timeline) }),

  /** text_delta: append to the open assistant bubble, else start a new one. */
  appendAssistantDelta: (delta) => {
    const timeline = get().timeline;
    const last = timeline[timeline.length - 1];
    if (isOpenAssistant(last)) {
      set({
        timeline: [
          ...timeline.slice(0, -1),
          { ...last, content: last.content + delta, loading: false },
        ],
      });
      return;
    }
    set({
      timeline: [
        ...timeline,
        {
          kind: "message",
          id: uid("a"),
          role: "assistant",
          content: delta,
          streaming: true,
          loading: false,
        },
      ],
    });
  },

  /** tool_call: close any open bubble, then push an executing tool card. */
  addToolCall: ({ id, name, args }) =>
    set({
      timeline: [
        ...closeOpenAssistant(get().timeline),
        { kind: "tool", id, name, args, status: "executing" },
      ],
    }),

  /** tool_result: attach the payload, flag failures, reopen a thinking bubble. */
  resolveToolCall: (id, result) => {
    const timeline = get().timeline.map((it) =>
      it.kind === "tool" && it.id === id
        ? {
            ...it,
            result,
            status: statusForResult(result),
            error: errorMessageForResult(result),
          }
        : it
    );
    set({ timeline: openAssistant(timeline) });
  },

  /**
   * done/error: close the open bubble and fold every assistant bubble produced
   * since the last user turn into one history entry — text *and* the tools that
   * ran. The tool records are what let the next request see the addressId, cart
   * or spinIds this turn resolved; without them the agent restarts blind and
   * re-asks questions it has already answered.
   */
  finaliseAssistantMessage: () => {
    const s = get();
    const timeline = closeOpenAssistant(s.timeline);

    const parts: string[] = [];
    const toolCalls: ToolCallRecord[] = [];
    for (let i = timeline.length - 1; i >= 0; i--) {
      const it = timeline[i];
      if (it.kind === "message" && it.role === "user") break;
      if (it.kind === "tool" && it.result !== undefined) {
        toolCalls.unshift({ id: it.id, name: it.name, args: it.args, result: it.result });
      }
      if (it.kind === "message" && it.role === "assistant" && it.content.trim()) {
        parts.unshift(it.content);
      }
    }

    const content = parts.join("\n\n");
    // A turn that ran tools but produced no text still carries state worth
    // keeping — that is exactly the turn the next one has to build on.
    const messages: ChatMessage[] =
      content || toolCalls.length
        ? [
            ...s.messages,
            {
              role: "assistant",
              content,
              ...(toolCalls.length ? { toolCalls } : {}),
              ts: Date.now(),
            },
          ]
        : s.messages;

    set({ messages, timeline });
    persist({ conversationId: s.conversationId, messages, timeline, conversations: s.conversations, mode: s.mode });
  },

  /** Hard stop (fatal error): drop the open bubble without writing history. */
  abortAssistant: () => {
    const s = get();
    const timeline = closeOpenAssistant(s.timeline);
    set({ timeline, isStreaming: false });
    persist({ conversationId: s.conversationId, messages: s.messages, timeline, conversations: s.conversations, mode: s.mode });
  },

  reset: () => {
    const s = get();
    const conversations = archiveCurrent(s);
    const next = {
      conversationId: uid("c"),
      messages: [] as ChatMessage[],
      timeline: [] as TimelineItem[],
      conversations,
      mode: s.mode,
    };
    set({ ...next, isStreaming: false });
    persist(next);
  },

  selectConversation: (id) => {
    const s = get();
    if (id === s.conversationId) return;
    const target = s.conversations.find((c) => c.id === id);
    if (!target) return;
    // Archive the live one first, then lift the target out of the archive so a
    // conversation is never in both places at once.
    const archived = archiveCurrent(s).filter((c) => c.id !== id);
    const next = {
      conversationId: target.id,
      messages: target.messages,
      timeline: target.timeline,
      conversations: archived,
      mode: s.mode,
    };
    set({ ...next, isStreaming: false });
    persist(next);
  },
}));
