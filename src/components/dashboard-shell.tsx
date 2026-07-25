"use client";

import { UserButton } from "@clerk/nextjs";
import type { UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ChatInterface } from "@/components/chat-interface";
import { ChatSidebar } from "@/components/chat-sidebar";
import { UserQuotaIndicator } from "@/components/user-quota-indicator";
import type { ChatThread } from "@/lib/chat-store";
import { DEFAULT_CHAT_ID } from "@/lib/chat-store";
import type { UserTokenUsage } from "@/lib/token-usage-store";

const DESKTOP_SIDEBAR_QUERY = "(min-width: 768px)";

type DashboardShellProps = {
  initialMessages: UIMessage[];
  initialChats: ChatThread[];
  activeChatId: string;
  chatPersistenceEnabled: boolean;
  usageTrackingEnabled: boolean;
  initialTokenUsage: UserTokenUsage | null;
};

function MenuIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

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
  const [chats, setChats] = useState(initialChats);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [activeChatHasMessages, setActiveChatHasMessages] = useState(
    initialMessages.length > 0,
  );
  // Collapsed on mobile by default; expanded on desktop after mount sync.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_SIDEBAR_QUERY);
    setSidebarOpen(media.matches);

    const onChange = (event: MediaQueryListEvent) => {
      setSidebarOpen(event.matches);
    };

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    setChats(initialChats);
  }, [initialChats]);

  useEffect(() => {
    setActiveChatHasMessages(initialMessages.length > 0);
  }, [activeChatId, initialMessages]);

  function isDesktopSidebar() {
    return window.matchMedia(DESKTOP_SIDEBAR_QUERY).matches;
  }

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

  function handleSelectChat(chatId: string) {
    navigateToChat(chatId);
    if (!isDesktopSidebar()) {
      setSidebarOpen(false);
    }
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

      setChats((current) => {
        const created = data.chat!;
        const withoutCreated = current.filter(
          (chat) => chat.chatId !== created.chatId,
        );
        const defaultChat = withoutCreated.find(
          (chat) => chat.chatId === DEFAULT_CHAT_ID,
        );
        const rest = withoutCreated.filter(
          (chat) => chat.chatId !== DEFAULT_CHAT_ID,
        );
        return defaultChat
          ? [defaultChat, created, ...rest]
          : [created, ...rest];
      });
      navigateToChat(data.chat.chatId);
      if (!isDesktopSidebar()) {
        setSidebarOpen(false);
      }
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
    const previousChats = chats;
    const wasActive = chatId === activeChatId;

    // Optimistic UI — don't wait on a full page refresh.
    setChats((current) => current.filter((chat) => chat.chatId !== chatId));
    if (wasActive) {
      navigateToChat(DEFAULT_CHAT_ID);
      if (!isDesktopSidebar()) {
        setSidebarOpen(false);
      }
    }

    try {
      const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Unable to delete this chat.");
      }
    } catch (error) {
      setChats(previousChats);
      setThreadError(
        error instanceof Error ? error.message : "Unable to delete this chat.",
      );
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {chatPersistenceEnabled ? (
            <button
              type="button"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-label={sidebarOpen ? "Collapse chat list" : "Open chat list"}
              aria-expanded={sidebarOpen}
              aria-controls="chat-sidebar"
              title={sidebarOpen ? "Collapse chats" : "Open chats"}
              className="cursor-pointer rounded-lg border border-border bg-surface p-2 text-brand transition hover:bg-brand-soft dark:hover:bg-brand-muted"
            >
              <MenuIcon />
            </button>
          ) : null}
          {threadError ? (
            <p className="text-sm text-red-700 dark:text-red-300">{threadError}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          {!chatPersistenceEnabled ? (
            <UserQuotaIndicator usage={tokenUsage} />
          ) : null}
          <UserButton />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 gap-4 overflow-hidden">
        {chatPersistenceEnabled ? (
          <ChatSidebar
            chats={chats}
            activeChatId={activeChatId}
            open={sidebarOpen}
            tokenUsage={tokenUsage}
            canCreate={activeChatHasMessages}
            disabled={isPending}
            onClose={() => setSidebarOpen(false)}
            onSelect={handleSelectChat}
            onCreate={() => void handleCreateChat()}
            onDelete={(chatId) => void handleDeleteChat(chatId)}
          />
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ChatInterface
            key={activeChatId}
            chatId={activeChatId}
            initialMessages={initialMessages}
            chatPersistenceEnabled={chatPersistenceEnabled}
            usageTrackingEnabled={usageTrackingEnabled}
            tokenUsage={tokenUsage}
            onTokenUsageChange={setTokenUsage}
            onHasMessagesChange={setActiveChatHasMessages}
          />
        </div>
      </div>
    </div>
  );
}
