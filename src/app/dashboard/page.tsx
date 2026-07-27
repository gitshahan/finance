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
  isLlmCredentialsConfigured,
  type UserLlmCredentialStatus,
} from "@/lib/llm-credentials-store";
import { loadUserLlmCredentialStatus } from "@/lib/llm-unlock-session";
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
  const llmCredentialsStorageReady = isLlmCredentialsConfigured();
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
  let llmCredentialStatus: UserLlmCredentialStatus = {
    configured: false,
    unlocked: false,
    provider: null,
    keyLastFour: null,
    updatedAt: null,
  };
  let hasExistingAccountData = false;

  if (userId && chatPersistenceEnabled) {
    try {
      initialChats = await listChatsByUser(userId);
      const knownIds = new Set(initialChats.map((chat) => chat.chatId));
      activeChatId = knownIds.has(requestedChatId)
        ? requestedChatId
        : DEFAULT_CHAT_ID;
      initialMessages = await loadMessagesByUser(userId, activeChatId);
      hasExistingAccountData =
        initialMessages.length > 0 || initialChats.length > 1;
    } catch (error) {
      chatPersistenceEnabled = false;
      console.error("Failed to load persisted chat messages:", error);
    }
  }

  if (userId) {
    try {
      tokenUsage = await getUserTokenUsage(userId);
      if (
        tokenUsage &&
        (tokenUsage.requestCount > 0 || tokenUsage.totalTokens > 0)
      ) {
        hasExistingAccountData = true;
      }
    } catch (error) {
      console.error("Failed to load user token usage:", error);
    }

    // Always resolve credentials for signed-in users so missing keys hard-block
    // the dashboard — including accounts that already have chat history.
    try {
      llmCredentialStatus = await loadUserLlmCredentialStatus(userId);
    } catch (error) {
      console.error("Failed to load LLM credential status:", error);
      llmCredentialStatus = {
        configured: false,
        unlocked: false,
        provider: null,
        keyLastFour: null,
        updatedAt: null,
      };
    }
  }

  const llmReady =
    llmCredentialsStorageReady &&
    llmCredentialStatus.configured &&
    llmCredentialStatus.unlocked;

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <DashboardShell
        initialMessages={llmReady ? initialMessages : []}
        initialChats={initialChats}
        activeChatId={activeChatId}
        chatPersistenceEnabled={llmReady && chatPersistenceEnabled}
        usageTrackingEnabled={usageTrackingEnabled}
        initialTokenUsage={llmReady ? tokenUsage : null}
        initialLlmCredentialStatus={llmCredentialStatus}
        llmCredentialsStorageReady={llmCredentialsStorageReady}
        hasExistingAccountData={hasExistingAccountData}
      />
    </main>
  );
}
