import {
  formatSharedReceiptsForPrompt,
  isSharedDataConfigured,
  listSharedReceiptsForUser,
  MAX_RECEIPTS_IN_PROMPT,
} from "@/lib/shared-data-store";
import { buildReceiptAssistantSystemPrompt } from "@/lib/receipt-assistant-prompt";

export async function buildChatSystemPrompt(userId: string) {
  if (!isSharedDataConfigured()) {
    return buildReceiptAssistantSystemPrompt(null);
  }

  const receipts = await listSharedReceiptsForUser(userId, {
    limit: MAX_RECEIPTS_IN_PROMPT,
  });
  const savedReceiptsContext = formatSharedReceiptsForPrompt(receipts);

  return buildReceiptAssistantSystemPrompt(savedReceiptsContext);
}
