import type { UIMessage } from "ai";

/**
 * Max number of most-recent messages sent to the model per request. Older turns
 * are dropped from the model payload (full thread is still persisted). This caps
 * input tokens and, critically, stops old image turns from being re-fetched and
 * re-inlined as base64 data URLs on every request.
 */
const DEFAULT_HISTORY_MESSAGE_WINDOW = 12;

export function getHistoryMessageWindow(): number {
  const raw = process.env.AI_HISTORY_MESSAGE_WINDOW;
  if (!raw) {
    return DEFAULT_HISTORY_MESSAGE_WINDOW;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_HISTORY_MESSAGE_WINDOW;
}

/**
 * FIFO sliding window: keep only the last `window` messages for the model.
 */
export function applyHistoryWindow(
  messages: UIMessage[],
  window: number = getHistoryMessageWindow(),
): UIMessage[] {
  if (messages.length <= window) {
    return messages;
  }

  return messages.slice(-window);
}
