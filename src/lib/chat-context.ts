import {
  formatReceiptIndexSummaryForPrompt,
  getSharedReceiptIndexSummary,
  isSharedDataConfigured,
} from "@/lib/shared-data-store";
import { buildReceiptAssistantSystemPrompt } from "@/lib/receipt-assistant-prompt";

export async function buildChatSystemPrompt(userId: string) {
  if (!isSharedDataConfigured()) {
    return buildReceiptAssistantSystemPrompt(null);
  }

  const summary = await getSharedReceiptIndexSummary(userId);
  const savedReceiptsContext = formatReceiptIndexSummaryForPrompt(summary);

  return buildReceiptAssistantSystemPrompt(savedReceiptsContext);
}
