"use client";

import { UserButton } from "@clerk/nextjs";
import type { UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChatInterface } from "@/components/chat-interface";
import { ChatThreadSwitcher } from "@/components/chat-thread-switcher";
import { UserQuotaIndicator } from "@/components/user-quota-indicator";
import type { ChatThread } from "@/lib/chat-store";
import { DEFAULT_CHAT_ID } from "@/lib/chat-store";
import type { UserTokenUsage } from "@/lib/token-usage-store";

type DashboardShellProps = {
  initialMessages: UIMessage[];
  initialChats: ChatThread[];
  activeChatId: string;
  chatPersistenceEnabled: boolean;
  usageTrackingEnabled: boolean;
  initialTokenUsage: UserTokenUsage | null;
};

export function DashboardShell({
  initialMessages,
  initialChats,
  activeChatId,
  chatPersistenceEnabled,
  usageTrackingEnabled,
  initialTokenUsage,
}: DashboardShellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tokenUsage, setTokenUsage] = useState<UserTokenUsage | null>(
    initialTokenUsage,
  );
  const [threadError, setThreadError] = useState<string | null>(null);

  function navigateToChat(chatId: string) {
    startTransition(() => {
      router.push(
        chatId === DEFAULT_CHAT_ID
          ? "/dashboard"
          : `/dashboard?chat=${encodeURIComponent(chatId)}`,
      );
      router.refresh();
    });
  }

  async function handleCreateChat() {
    setThreadError(null);

    try {
      const response = await fetch("/api/chats", { method: "POST" });
      if (!response.ok) {
        throw new Error("Unable to create a new chat.");
      }

      const data = (await response.json()) as { chat?: ChatThread };
      if (!data.chat) {
        throw new Error("Unable to create a new chat.");
      }

      navigateToChat(data.chat.chatId);
    } catch (error) {
      setThreadError(
        error instanceof Error ? error.message : "Unable to create a new chat.",
      );
    }
  }

  async function handleDeleteChat(chatId: string) {
    if (chatId === DEFAULT_CHAT_ID) {
      return;
    }

    setThreadError(null);

    try {
      const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Unable to delete this chat.");
      }

      navigateToChat(DEFAULT_CHAT_ID);
    } catch (error) {
      setThreadError(
        error instanceof Error ? error.message : "Unable to delete this chat.",
      );
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Finance Chat
          </h1>
          {chatPersistenceEnabled ? (
            <ChatThreadSwitcher
              chats={initialChats}
              activeChatId={activeChatId}
              disabled={isPending}
              onSelect={navigateToChat}
              onCreate={() => void handleCreateChat()}
              onDelete={(chatId) => void handleDeleteChat(chatId)}
            />
          ) : null}
          {threadError ? (
            <p className="text-sm text-red-700 dark:text-red-300">{threadError}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <UserQuotaIndicator usage={tokenUsage} />
          <UserButton />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatInterface
          key={activeChatId}
          chatId={activeChatId}
          initialMessages={initialMessages}
          chatPersistenceEnabled={chatPersistenceEnabled}
          usageTrackingEnabled={usageTrackingEnabled}
          tokenUsage={tokenUsage}
          onTokenUsageChange={setTokenUsage}
        />
      </div>
    </div>
  );
}
