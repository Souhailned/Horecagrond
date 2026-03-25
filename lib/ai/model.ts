/**
 * Shared AI model factory — used by chat route, concept checker, etc.
 *
 * Priority: Groq → OpenAI → Ollama (local)
 */

import type { LanguageModel } from "ai";

export async function getModel(): Promise<{ model: LanguageModel; supportsTools: boolean }> {
  // 1. Groq (cloud, fast)
  if (process.env.GROQ_API_KEY) {
    const { createGroq } = await import("@ai-sdk/groq");
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    return { model: groq("llama-3.3-70b-versatile"), supportsTools: true };
  }

  // 2. OpenAI
  if (process.env.OPENAI_API_KEY) {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return { model: openai("gpt-4o-mini"), supportsTools: true };
  }

  // 3. Ollama (local, free) via OpenAI-compatible API
  const { createOpenAI } = await import("@ai-sdk/openai");
  const ollama = createOpenAI({
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",
  });
  return { model: ollama("llama3.2:3b"), supportsTools: false };
}

/**
 * Vision model factory — used by floor plan image scanning, etc.
 *
 * Priority: Groq (llama-4-scout) → OpenAI (gpt-4o-mini) → null
 * Returns null when no vision-capable provider is configured.
 */
export async function getVisionModel(): Promise<{
  model: LanguageModel;
  supportsTools: boolean;
} | null> {
  // 1. Groq (cloud, fast — llama-4-scout supports vision)
  if (process.env.GROQ_API_KEY) {
    try {
      const { createGroq } = await import("@ai-sdk/groq");
      const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
      return { model: groq("meta-llama/llama-4-scout-17b-16e-instruct"), supportsTools: false };
    } catch { /* fall through */ }
  }

  // 2. OpenAI (gpt-4o-mini supports vision)
  if (process.env.OPENAI_API_KEY) {
    try {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return { model: openai("gpt-4o-mini"), supportsTools: true };
    } catch { /* fall through */ }
  }

  return null;
}
