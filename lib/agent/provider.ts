// LLM provider selection. Both Groq and NVIDIA NIM speak the OpenAI wire format,
// so a single `openai` client serves both — only baseURL/key/model differ.
//
// groq-sdk can't be pointed at NIM: it hardcodes `/openai/v1/chat/completions`,
// which NVIDIA answers with a 404. Hence the openai SDK for both.

import OpenAI from "openai";

export type LLMProvider = "nvidia" | "groq";

interface ProviderConfig {
  baseURL: string;
  apiKeyEnv: string;
  defaultModel: string;
}

const PROVIDERS: Record<LLMProvider, ProviderConfig> = {
  nvidia: {
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKeyEnv: "NVIDIA_API_KEY",
    // Benchmarked against the real 28-tool schema set (scripts/bench-nvidia.ts
    // + bench-loop.ts): 3/3 correct routing, and the only fast model that also
    // chained a full multi-round loop (addresses -> search -> menu). Slower than
    // openai/gpt-oss-20b (~8s vs ~40s), but that one stops after one hop, which
    // breaks the search -> cart -> coupon -> order chain this agent needs.
    defaultModel: "deepseek-ai/deepseek-v4-pro",
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
  },
};

export function activeProvider(): LLMProvider {
  const raw = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (raw === "groq" || raw === "nvidia") return raw;
  // Infer from whichever key is present; prefer NVIDIA.
  if (process.env.NVIDIA_API_KEY) return "nvidia";
  if (process.env.GROQ_API_KEY) return "groq";
  return "nvidia";
}

export function resolveModel(provider: LLMProvider = activeProvider()): string {
  return process.env.LLM_MODEL?.trim() || PROVIDERS[provider].defaultModel;
}

export function createLLMClient(provider: LLMProvider = activeProvider()): OpenAI {
  const cfg = PROVIDERS[provider];
  const apiKey = process.env[cfg.apiKeyEnv];
  if (!apiKey) {
    throw new Error(
      `${cfg.apiKeyEnv} is not set. Provider "${provider}" needs it — add it to .env.local, or set LLM_PROVIDER to the other provider.`
    );
  }
  return new OpenAI({ apiKey, baseURL: cfg.baseURL });
}
