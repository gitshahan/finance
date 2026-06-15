import type { UIMessage } from "ai";

/**
 * Max recent messages forwarded to the model. Older turns are dropped to cap
 * input tokens on long conversations (the full history is still persisted).
 * Override with AI_CHAT_HISTORY_WINDOW.
 */
const DEFAULT_HISTORY_WINDOW = 20;

function resolveHistoryWindow(): number {
  const raw = Number.parseInt(process.env.AI_CHAT_HISTORY_WINDOW ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_HISTORY_WINDOW;
}

/**
 * Keep only the most recent messages (sliding window / FIFO trim) so we never
 * dump an unbounded chat history into the model. The window starts on a user
 * message to avoid leading orphaned assistant turns.
 */
export function selectRecentMessages(
  messages: UIMessage[],
  window: number = resolveHistoryWindow(),
): UIMessage[] {
  if (messages.length <= window) {
    return messages;
  }

  let recent = messages.slice(-window);

  const firstUserIndex = recent.findIndex(
    (message) => message.role === "user",
  );

  if (firstUserIndex > 0) {
    recent = recent.slice(firstUserIndex);
  }

  return recent;
}
