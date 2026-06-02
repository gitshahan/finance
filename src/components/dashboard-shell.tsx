"use client";

import type { UIMessage } from "ai";
import { ChatInterface } from "@/components/chat-interface";
import type { UserTokenUsage } from "@/lib/token-usage-store";

type DashboardShellProps = {
  initialMessages: UIMessage[];
  chatPersistenceEnabled: boolean;
  tokenUsage: UserTokenUsage | null;
};

export function DashboardShell({
  initialMessages,
  chatPersistenceEnabled,
  tokenUsage,
}: DashboardShellProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ChatInterface
        initialMessages={initialMessages}
        chatPersistenceEnabled={chatPersistenceEnabled}
        initialTokenUsage={tokenUsage}
      />
    </div>
  );
}
