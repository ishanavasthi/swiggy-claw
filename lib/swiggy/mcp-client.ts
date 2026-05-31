// Swiggy MCP clients: one Client per server. Mock (in-process) by default; real
// StreamableHTTP endpoints when SWIGGY_USE_MOCK=false and a bearer token is present.
// callTool() routes by toolServerMap and normalizes the MCP result to a plain object.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { SwiggyServer } from "@/types/agent";
import { createMockClient } from "./mock/server";

export type SwiggyMCPClients = Record<SwiggyServer, Client>;

export class ToolCallError extends Error {
  constructor(message: string, readonly toolName: string) {
    super(message);
    this.name = "ToolCallError";
  }
}

function useMock(): boolean {
  return process.env.SWIGGY_USE_MOCK !== "false";
}

const SERVER_URLS: Record<SwiggyServer, string | undefined> = {
  food: process.env.SWIGGY_FOOD_MCP_URL,
  instamart: process.env.SWIGGY_INSTAMART_MCP_URL,
  dineout: process.env.SWIGGY_DINEOUT_MCP_URL,
};

async function createRealClient(server: SwiggyServer, token: string): Promise<Client> {
  const url = SERVER_URLS[server];
  if (!url) throw new Error(`Missing MCP URL for server "${server}"`);
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: `swiggy-${server}-client`, version: "1.0.0" });
  await client.connect(transport);
  return client;
}

export async function createClients(token?: string): Promise<SwiggyMCPClients> {
  if (useMock()) {
    const [food, instamart, dineout] = await Promise.all([
      createMockClient("food"),
      createMockClient("instamart"),
      createMockClient("dineout"),
    ]);
    return { food, instamart, dineout };
  }
  if (!token) throw new Error("A Swiggy access token is required when SWIGGY_USE_MOCK=false");
  const [food, instamart, dineout] = await Promise.all([
    createRealClient("food", token),
    createRealClient("instamart", token),
    createRealClient("dineout", token),
  ]);
  return { food, instamart, dineout };
}

// Singleton cache keyed by token so we don't re-handshake every request.
let cache: { key: string; clients: Promise<SwiggyMCPClients> } | null = null;

export function getClients(token?: string): Promise<SwiggyMCPClients> {
  const key = useMock() ? "mock" : token ?? "";
  if (!cache || cache.key !== key) {
    cache = { key, clients: createClients(token) };
  }
  return cache.clients;
}

/** Extract a plain JS value from an MCP CallToolResult (concatenated text blocks → JSON). */
function normalizeResult(result: any, toolName: string): unknown {
  const blocks = Array.isArray(result?.content) ? result.content : [];
  const text = blocks
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text)
    .join("");
  let parsed: unknown = text;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { success: false, error: { message: `Unparseable result from ${toolName}` } };
    }
  } else if (result?.structuredContent) {
    parsed = result.structuredContent;
  }
  // Protocol-level tool failure flagged by the server.
  if (result?.isError && parsed && typeof parsed === "object" && !("success" in (parsed as object))) {
    return { success: false, error: { message: text || `Tool ${toolName} reported an error` } };
  }
  return parsed;
}

export async function callTool(
  clients: SwiggyMCPClients,
  toolName: string,
  args: Record<string, unknown>,
  toolServerMap: Map<string, SwiggyServer>
): Promise<unknown> {
  const server = toolServerMap.get(toolName);
  if (!server) throw new ToolCallError(`No server registered for tool "${toolName}"`, toolName);
  const client = clients[server];
  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    return normalizeResult(result, toolName);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ToolCallError(`Tool "${toolName}" failed: ${message}`, toolName);
  }
}
