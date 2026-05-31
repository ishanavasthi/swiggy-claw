// Load MCP tools from all three Swiggy servers and expose them in Groq's
// OpenAI-compatible ChatCompletionTool format. MCP inputSchema is valid JSON Schema,
// so it passes through verbatim — no translation layer.

import type { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";
import type { ChatCompletionTool } from "groq-sdk/resources/chat/completions";
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

let cached: LoadedTools | null = null;

export async function loadAllGroqTools(clients: SwiggyMCPClients): Promise<LoadedTools> {
  if (cached) return cached;

  const tools: ChatCompletionTool[] = [];
  const toolServerMap = new Map<string, SwiggyServer>();

  for (const server of SERVERS) {
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

  cached = { tools, toolServerMap };
  return cached;
}

export function clearToolCache() {
  cached = null;
}
