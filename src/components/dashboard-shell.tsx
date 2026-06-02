"use client";

import type { UIMessage } from "ai";
import { ChatInterface } from "@/components/chat-interface";
import { DashboardTabs } from "@/components/dashboard-tabs";
import { ReceiptsDataPanel } from "@/components/receipts-data-panel";
import { ReceiptExportProvider } from "@/contexts/receipt-export-context";
import type { UserTokenUsage } from "@/lib/token-usage-store";

type DashboardShellProps = {
  initialMessages: UIMessage[];
  chatPersistenceEnabled: boolean;
  sharedDataEnabled: boolean;
  tokenUsage: UserTokenUsage | null;
};

export function DashboardShell({
  initialMessages,
  chatPersistenceEnabled,
  sharedDataEnabled,
  tokenUsage,
}: DashboardShellProps) {
  return (
    <ReceiptExportProvider sharedDataEnabled={sharedDataEnabled}>
      <DashboardTabs
        chat={
          <ChatInterface
            initialMessages={initialMessages}
            chatPersistenceEnabled={chatPersistenceEnabled}
            initialTokenUsage={tokenUsage}
          />
        }
        receipts={<ReceiptsDataPanel sharedDataEnabled={sharedDataEnabled} />}
      />
    </ReceiptExportProvider>
  );
}
