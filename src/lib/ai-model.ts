import { createOpenAI } from "@ai-sdk/openai";

/**
 * OpenAI model id (no `provider/` prefix). Must support vision for receipt images.
 * `AI_CHAT_MODEL` may still use gateway-style `openai/gpt-…` — the prefix is stripped.
 */
export const CHAT_MODEL_ID = (() => {
  const raw = process.env.AI_CHAT_MODEL?.trim() || "gpt-5.4-nano";
  return raw.includes("/") ? raw.split("/").pop()! : raw;
})();

/** @deprecated Prefer getChatModel(apiKey) — kept for any leftover string references. */
export const CHAT_MODEL = CHAT_MODEL_ID;

export function getChatModel(apiKey: string) {
  const openai = createOpenAI({ apiKey: apiKey.trim() });
  return openai(CHAT_MODEL_ID);
}
