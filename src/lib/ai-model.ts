/** Chat model via Vercel AI Gateway (`provider/model`). Needs vision for receipt images. */
export const CHAT_MODEL =
  process.env.AI_CHAT_MODEL ?? "openai/gpt-5.4-nano";
