"use client";

import { create } from "zustand";
import type { ChatMessage, ToolCallRecord } from "@/types/agent";

interface StreamingAssistant {
  content: string;
  toolCalls: ToolCallRecord[];
}

interface ChatState {
  messages: ChatMessage[];
  streaming: StreamingAssistant | null;
  isStreaming: boolean;

  hydrate: () => void;
  addUserMessage: (text: string) => void;
  beginAssistant: () => void;
  appendAssistantDelta: (delta: string) => void;
  addToolCall: (rec: { id: string; name: string; args: unknown }) => void;
  resolveToolCall: (id: string, result: unknown) => void;
  finaliseAssistantMessage: () => void;
  setStreaming: (v: boolean) => void;
  reset: () => void;
}

const STORAGE_KEY = "swiggy-claw-messages";

function persist(messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    /* ignore quota errors */
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streaming: null,
  isStreaming: false,

  hydrate: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) set({ messages: JSON.parse(raw) as ChatMessage[] });
    } catch {
      /* ignore */
    }
  },

  addUserMessage: (text) => {
    const messages = [...get().messages, { role: "user" as const, content: text }];
    set({ messages });
    persist(messages);
  },

  beginAssistant: () => set({ streaming: { content: "", toolCalls: [] } }),

  appendAssistantDelta: (delta) => {
    const s = get().streaming ?? { content: "", toolCalls: [] };
    set({ streaming: { ...s, content: s.content + delta } });
  },

  addToolCall: (rec) => {
    const s = get().streaming ?? { content: "", toolCalls: [] };
    set({ streaming: { ...s, toolCalls: [...s.toolCalls, { ...rec }] } });
  },

  resolveToolCall: (id, result) => {
    const s = get().streaming;
    if (!s) return;
    set({
      streaming: {
        ...s,
        toolCalls: s.toolCalls.map((t) => (t.id === id ? { ...t, result } : t)),
      },
    });
  },

  finaliseAssistantMessage: () => {
    const s = get().streaming;
    if (!s) return;
    const msg: ChatMessage = {
      role: "assistant",
      content: s.content,
      toolCalls: s.toolCalls.length ? s.toolCalls : undefined,
    };
    const messages = [...get().messages, msg];
    set({ messages, streaming: null });
    persist(messages);
  },

  setStreaming: (v) => set({ isStreaming: v }),

  reset: () => {
    set({ messages: [], streaming: null });
    persist([]);
  },
}));
