// Load MCP tools from all three Swiggy servers and expose them in Groq's
// OpenAI-compatible ChatCompletionTool format. MCP inputSchema is valid JSON Schema,
// so it passes through verbatim — no translation layer.

import type { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { SwiggyServer } from "@/types/agent";
import type { SwiggyMCPClients } from "./mcp-client";

export interface LoadedTools {
  tools: ChatCompletionTool[];
  toolServerMap: Map<string, SwiggyServer>;
}

export function mcpToolToGroqTool(tool: MCPTool): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description ?? "",
      parameters: (tool.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
    },
  };
}

const SERVERS: SwiggyServer[] = ["food", "instamart", "dineout"];

// Only enabled servers' tools enter the Groq context. Fewer tools = far fewer input
// tokens per request — important on Groq's free tier (8b TPM is only 6,000). Set
// SWIGGY_ENABLED_SERVERS="food" for the lean food slice, or list several / omit for all.
function enabledServers(): SwiggyServer[] {
  const raw = process.env.SWIGGY_ENABLED_SERVERS;
  if (!raw || !raw.trim()) return SERVERS;
  const wanted = new Set(raw.split(",").map((s) => s.trim().toLowerCase()));
  const list = SERVERS.filter((s) => wanted.has(s));
  return list.length ? list : SERVERS;
}

let cached: LoadedTools | null = null;

/**
 * Caching the inventory for the process lifetime is right in production and wrong
 * in dev. Editing the mock registry hot-reloads that module but leaves this cache
 * holding the previous tool set, while the system prompt — imported directly by
 * the route — does reload. The prompt then steers the model at a tool the list no
 * longer offers, the loop rejects it as unknown, and after two strikes gives up
 * and reports a missing capability. The bug reads as "Dineout is broken" when
 * nothing but the cache is stale.
 */
const CACHE_TOOLS = process.env.NODE_ENV === "production";

export async function loadAllGroqTools(clients: SwiggyMCPClients): Promise<LoadedTools> {
  if (CACHE_TOOLS && cached) return cached;

  const tools: ChatCompletionTool[] = [];
  const toolServerMap = new Map<string, SwiggyServer>();

  for (const server of enabledServers()) {
    const { tools: mcpTools } = await clients[server].listTools();
    for (const tool of mcpTools) {
      if (toolServerMap.has(tool.name)) {
        // Names must be globally unique for the flat Groq tool list.
        console.warn(`[tools] duplicate tool name "${tool.name}" — keeping first (${toolServerMap.get(tool.name)})`);
        continue;
      }
      tools.push(mcpToolToGroqTool(tool as MCPTool));
      toolServerMap.set(tool.name, server);
    }
  }

  const loaded = { tools, toolServerMap };
  if (CACHE_TOOLS) cached = loaded;
  return loaded;
}

export function clearToolCache() {
  cached = null;
}
