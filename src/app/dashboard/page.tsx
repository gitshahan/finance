import { auth } from "@clerk/nextjs/server";
import type { UIMessage } from "ai";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  DEFAULT_CHAT_ID,
  isChatPersistenceConfigured,
  isValidChatId,
  listChatsByUser,
  loadMessagesByUser,
  type ChatThread,
} from "@/lib/chat-store";
import {
  getUserTokenUsage,
  isTokenUsageConfigured,
  type UserTokenUsage,
} from "@/lib/token-usage-store";

type DashboardPageProps = {
  searchParams: Promise<{ chat?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { userId } = await auth();
  const params = await searchParams;
  const requestedChatId =
    typeof params.chat === "string" && isValidChatId(params.chat)
      ? params.chat
      : DEFAULT_CHAT_ID;

  const usageTrackingEnabled = isTokenUsageConfigured();
  let chatPersistenceEnabled = isChatPersistenceConfigured();
  let initialMessages: UIMessage[] = [];
  let initialChats: ChatThread[] = [
    {
      chatId: DEFAULT_CHAT_ID,
      title: "Main chat",
      updatedAt: new Date(0).toISOString(),
    },
  ];
  let activeChatId = requestedChatId;
  let tokenUsage: UserTokenUsage | null = null;

  if (userId && chatPersistenceEnabled) {
    try {
      initialChats = await listChatsByUser(userId);
      const knownIds = new Set(initialChats.map((chat) => chat.chatId));
      activeChatId = knownIds.has(requestedChatId)
        ? requestedChatId
        : DEFAULT_CHAT_ID;
      initialMessages = await loadMessagesByUser(userId, activeChatId);
    } catch (error) {
      chatPersistenceEnabled = false;
      console.error("Failed to load persisted chat messages:", error);
    }
  }

  if (userId) {
    try {
      tokenUsage = await getUserTokenUsage(userId);
    } catch (error) {
      console.error("Failed to load user token usage:", error);
    }
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background p-4 sm:p-6">
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden">
        <DashboardShell
          initialMessages={initialMessages}
          initialChats={initialChats}
          activeChatId={activeChatId}
          chatPersistenceEnabled={chatPersistenceEnabled}
          usageTrackingEnabled={usageTrackingEnabled}
          initialTokenUsage={tokenUsage}
        />
      </div>
    </main>
  );
}
