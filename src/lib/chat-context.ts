import {
  formatSharedReceiptsForPrompt,
  isSharedDataConfigured,
  listSharedReceiptsForUser,
} from "@/lib/shared-data-store";
import { buildReceiptAssistantSystemPrompt } from "@/lib/receipt-assistant-prompt";

/** Cap saved receipts injected into the prompt (newest first) to bound input tokens. */
const MAX_RECEIPTS_IN_CONTEXT = Math.max(
  1,
  Number.parseInt(process.env.CHAT_MAX_RECEIPTS_IN_CONTEXT ?? "40", 10) || 40,
);

export async function buildChatSystemPrompt(userId: string) {
  if (!isSharedDataConfigured()) {
    return buildReceiptAssistantSystemPrompt(null);
  }

  const receipts = await listSharedReceiptsForUser(userId, {
    limit: MAX_RECEIPTS_IN_CONTEXT,
  });
  const savedReceiptsContext = formatSharedReceiptsForPrompt(receipts);

  return buildReceiptAssistantSystemPrompt(savedReceiptsContext);
}
