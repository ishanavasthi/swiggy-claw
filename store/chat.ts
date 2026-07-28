"use client";

import { create } from "zustand";
import type {
  AgentMode,
  ChatMessage,
  TimelineItem,
  TimelineMessage,
  ToolStatus,
} from "@/types/agent";

/**
 * Two parallel models live here:
 *
 *  - `timeline`  the ordered render model. Preserves text → tool → text
 *                interleaving inside a single agent turn, which is what the UI
 *                draws (bubbles with tool cards positioned between them).
 *  - `messages`  the flat API history POSTed back to /api/chat. The server's
 *                `buildHistoryFromMessages` filters to non-empty text turns, so
 *                this stays plain {role, content}.
 */

const STORAGE_KEY = "swiggy-claw-chat-v2";
const LEGACY_MESSAGES_KEY = "swiggy-claw-messages";

interface PersistedShape {
  version: 2;
  messages: ChatMessage[];
  timeline: TimelineItem[];
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

// --- persistence ------------------------------------------------------------

function persist(state: Pick<ChatState, "messages" | "timeline" | "mode">) {
  if (typeof window === "undefined") return;
  try {
    const blob: PersistedShape = {
      version: 2,
      messages: state.messages,
      timeline: state.timeline,
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
  messages: ChatMessage[];
  timeline: TimelineItem[];
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
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  timeline: [],
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
        if (blob && blob.version === 2 && Array.isArray(blob.messages) && Array.isArray(blob.timeline)) {
          set({
            messages: blob.messages,
            timeline: blob.timeline,
            mode: blob.mode ?? "food",
            hydrated: true,
          });
          return;
        }
      }
      const legacy = readLegacy();
      if (legacy) {
        set({ ...legacy, hydrated: true });
        window.localStorage.removeItem(LEGACY_MESSAGES_KEY);
        persist({ ...legacy, mode: get().mode });
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
    persist({ messages: s.messages, timeline: s.timeline, mode });
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
    persist({ messages, timeline, mode: s.mode });
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
   * since the last user turn into one history entry.
   */
  finaliseAssistantMessage: () => {
    const s = get();
    const timeline = closeOpenAssistant(s.timeline);

    const parts: string[] = [];
    for (let i = timeline.length - 1; i >= 0; i--) {
      const it = timeline[i];
      if (it.kind === "message" && it.role === "user") break;
      if (it.kind === "message" && it.role === "assistant" && it.content.trim()) {
        parts.unshift(it.content);
      }
    }

    const content = parts.join("\n\n");
    const messages: ChatMessage[] = content
      ? [...s.messages, { role: "assistant", content, ts: Date.now() }]
      : s.messages;

    set({ messages, timeline });
    persist({ messages, timeline, mode: s.mode });
  },

  /** Hard stop (fatal error): drop the open bubble without writing history. */
  abortAssistant: () => {
    const s = get();
    const timeline = closeOpenAssistant(s.timeline);
    set({ timeline, isStreaming: false });
    persist({ messages: s.messages, timeline, mode: s.mode });
  },

  reset: () => {
    const mode = get().mode;
    set({ messages: [], timeline: [], isStreaming: false });
    persist({ messages: [], timeline: [], mode });
  },
}));
