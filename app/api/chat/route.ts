// Streaming agent endpoint. Returns text/event-stream immediately and drives the
// orchestrator generator from inside the ReadableStream (no awaiting the producer).

import { NextRequest } from "next/server";
import type { ChatMessage, SSEEvent } from "@/types/agent";
import { requireAuth, AuthError } from "@/lib/session";
import { getClients } from "@/lib/swiggy/mcp-client";
import { loadAllGroqTools } from "@/lib/swiggy/tools";
import { buildCallMCPTool } from "@/lib/agent/guards";
import { runAgentStream, buildHistoryFromMessages } from "@/lib/agent/orchestrator";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  messages?: ChatMessage[];
  userMessage?: string;
}

export async function POST(req: NextRequest) {
  let token: string;
  try {
    token = await requireAuth();
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ error: "unauthenticated", redirectTo: "/api/auth/login" }, { status: 401 });
    }
    throw err;
  }

  const body = (await req.json().catch(() => ({}))) as ChatBody;
  const userMessage = body.userMessage?.trim();
  if (!userMessage) {
    return Response.json({ error: "userMessage is required" }, { status: 400 });
  }
  const history = buildHistoryFromMessages(body.messages ?? []);

  const clients = await getClients(token);
  const { tools, toolServerMap } = await loadAllGroqTools(clients);
  const callMCPTool = buildCallMCPTool(clients, toolServerMap);

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, event: SSEEvent) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runAgentStream(userMessage, history, tools, callMCPTool, SYSTEM_PROMPT)) {
          send(controller, event);
        }
      } catch (err) {
        send(controller, { type: "error", payload: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
