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

function OpenSidebarIcon() {
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
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}

function NewChatIcon() {
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
      <path d="M12 5v14" />
      <path d="M5 12h14" />
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
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
        <header className="relative z-10 flex min-w-0 shrink-0 items-center gap-3 border-b border-border/80 bg-surface px-3 py-2.5 shadow-[0_1px_0_rgba(15,39,68,0.04),0_4px_12px_rgba(15,39,68,0.06)] dark:shadow-[0_1px_0_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.25)]">
          {chatPersistenceEnabled && !sidebarOpen ? (
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open chat list"
                aria-expanded={false}
                aria-controls="chat-sidebar"
                title="Open chats"
                className="group relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition hover:bg-brand-soft hover:text-brand focus-visible:bg-brand-soft focus-visible:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring dark:hover:bg-brand-muted dark:hover:text-brand-strong dark:focus-visible:bg-brand-muted dark:focus-visible:text-brand-strong"
              >
                {/* Mobile: always show expand icon (no hover). Desktop: logo → icon on hover. */}
                <span className="flex items-center justify-center md:hidden">
                  <OpenSidebarIcon />
                </span>
                <img
                  src="/vite.svg"
                  alt=""
                  width={28}
                  height={28}
                  className="hidden h-7 w-7 rounded-md bg-white object-contain p-0.5 shadow-sm transition-opacity md:block md:group-hover:opacity-0 md:group-focus-visible:opacity-0"
                />
                <span className="pointer-events-none absolute inset-0 hidden items-center justify-center opacity-0 transition-opacity md:flex md:group-hover:opacity-100 md:group-focus-visible:opacity-100">
                  <OpenSidebarIcon />
                </span>
              </button>
              {activeChatHasMessages ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => void handleCreateChat()}
                  aria-label="New chat"
                  title="New chat"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition hover:bg-brand-soft hover:text-brand focus-visible:bg-brand-soft focus-visible:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-brand-muted dark:hover:text-brand-strong dark:focus-visible:bg-brand-muted dark:focus-visible:text-brand-strong"
                >
                  <NewChatIcon />
                </button>
              ) : null}
            </div>
          ) : null}

          {threadError ? (
            <p className="min-w-0 flex-1 truncate text-sm text-red-700 dark:text-red-300">
              {threadError}
            </p>
          ) : (
            <div className="min-w-0 flex-1" />
          )}

          <div className="flex shrink-0 items-center gap-4">
            {!chatPersistenceEnabled ? (
              <div className="hidden w-44 sm:block">
                <UserQuotaIndicator usage={tokenUsage} />
              </div>
            ) : null}
            <UserButton
              appearance={{
                elements: {
                  avatarBox:
                    "rounded-full border border-border shadow-sm ring-0",
                  userButtonTrigger:
                    "cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
                },
              }}
            />
          </div>
        </header>

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
