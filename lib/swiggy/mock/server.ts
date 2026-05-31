// Builds a real low-level MCP Server per Swiggy server (food/im/dineout) backed by the
// mock tool registry, and connects it to a Client over an in-process linked transport.
// The Client returned here is API-identical to a StreamableHTTP client, so the agent
// code path is the same for mock and real backends.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { SwiggyServer } from "@/types/agent";
import { MOCK_TOOLS_BY_SERVER } from "./tools";

export async function createMockClient(serverName: SwiggyServer): Promise<Client> {
  const tools = MOCK_TOOLS_BY_SERVER[serverName];

  const server = new Server(
    { name: `mock-swiggy-${serverName}`, version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: { message: `Unknown tool: ${req.params.name}` } }) }],
        isError: true,
      };
    }
    try {
      const result = tool.handler((req.params.arguments ?? {}) as Record<string, unknown>);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: { message } }) }],
        isError: true,
      };
    }
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: `swiggy-${serverName}-client`, version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}
