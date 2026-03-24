/**
 * Vision model factory for AI photo classification.
 * Uses Groq llama-4-scout (cheapest, ~$0.001/batch) with OpenAI gpt-4o-mini fallback.
 */

import type { LanguageModel } from "ai";

export async function getVisionModel(): Promise<{ model: LanguageModel; provider: string }> {
  // 1. Groq (primary -- cheapest for vision)
  if (process.env.GROQ_API_KEY) {
    const { createGroq } = await import("@ai-sdk/groq");
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    return { model: groq("meta-llama/llama-4-scout-17b-16e-instruct"), provider: "groq" };
  }

  // 2. OpenAI fallback
  if (process.env.OPENAI_API_KEY) {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return { model: openai("gpt-4o-mini"), provider: "openai" };
  }

  throw new Error("[getVisionModel] No vision API key configured. Set GROQ_API_KEY or OPENAI_API_KEY.");
}
