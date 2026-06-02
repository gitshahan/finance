"use client";

import { UserButton } from "@clerk/nextjs";
import type { UIMessage } from "ai";
import { useState } from "react";
import { ChatInterface } from "@/components/chat-interface";
import { UserQuotaIndicator } from "@/components/user-quota-indicator";
import type { UserTokenUsage } from "@/lib/token-usage-store";

type DashboardShellProps = {
  initialMessages: UIMessage[];
  chatPersistenceEnabled: boolean;
  initialTokenUsage: UserTokenUsage | null;
};

export function DashboardShell({
  initialMessages,
  chatPersistenceEnabled,
  initialTokenUsage,
}: DashboardShellProps) {
  const [tokenUsage, setTokenUsage] = useState<UserTokenUsage | null>(
    initialTokenUsage,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Finance Chat
        </h1>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <UserQuotaIndicator usage={tokenUsage} />
          <UserButton />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatInterface
          initialMessages={initialMessages}
          chatPersistenceEnabled={chatPersistenceEnabled}
          tokenUsage={tokenUsage}
          onTokenUsageChange={setTokenUsage}
        />
      </div>
    </div>
  );
}
