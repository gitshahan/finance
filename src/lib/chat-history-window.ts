import type { UIMessage } from "ai";

/**
 * Cap how many trailing messages are sent to the model per request. Older turns
 * stay persisted but are dropped from the outgoing payload, which avoids
 * re-sending the entire (image-heavy) thread on every request. Override with
 * AI_HISTORY_MESSAGE_WINDOW.
 */
const DEFAULT_HISTORY_MESSAGE_WINDOW = 12;

export function getHistoryMessageWindow(): number {
  const parsed = Number.parseInt(
    process.env.AI_HISTORY_MESSAGE_WINDOW ?? "",
    10,
  );

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_HISTORY_MESSAGE_WINDOW;
}

/**
 * FIFO sliding window over conversation history. Keeps the most recent
 * `windowSize` messages and trims any leading assistant/tool messages so the
 * window always begins on a user turn (prevents dangling tool results that some
 * providers reject).
 */
export function applyHistoryWindow(
  messages: UIMessage[],
  windowSize: number = getHistoryMessageWindow(),
): UIMessage[] {
  if (messages.length <= windowSize) {
    return messages;
  }

  let windowed = messages.slice(-windowSize);

  while (windowed.length > 0 && windowed[0].role !== "user") {
    windowed = windowed.slice(1);
  }

  return windowed.length > 0 ? windowed : messages.slice(-1);
}
