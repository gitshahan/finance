import {
  formatSharedReceiptsForPrompt,
  isSharedDataConfigured,
  listSharedReceiptsForUser,
} from "@/lib/shared-data-store";
import { buildReceiptAssistantSystemPrompt } from "@/lib/receipt-assistant-prompt";

export async function buildChatSystemPrompt(userId: string) {
  if (!isSharedDataConfigured()) {
    return buildReceiptAssistantSystemPrompt(null);
  }

  const receipts = await listSharedReceiptsForUser(userId, { limit: 40 });
  const savedReceiptsContext = formatSharedReceiptsForPrompt(receipts);

  return buildReceiptAssistantSystemPrompt(savedReceiptsContext);
}
