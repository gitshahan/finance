import { auth } from "@clerk/nextjs/server";
import type { UIMessage } from "ai";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  isChatPersistenceConfigured,
  loadMessagesByUser,
} from "@/lib/chat-store";
import {
  getUserTokenUsage,
  type UserTokenUsage,
} from "@/lib/token-usage-store";

export default async function DashboardPage() {
  const { userId } = await auth();
  let chatPersistenceEnabled = isChatPersistenceConfigured();
  let initialMessages: UIMessage[] = [];
  let tokenUsage: UserTokenUsage | null = null;

  if (userId && chatPersistenceEnabled) {
    try {
      initialMessages = await loadMessagesByUser(userId);
    } catch (error) {
      // Keep the dashboard usable even when persistence is misconfigured or unavailable.
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
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50 p-4 dark:bg-black sm:p-6">
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden">
        <DashboardShell
          initialMessages={initialMessages}
          chatPersistenceEnabled={chatPersistenceEnabled}
          initialTokenUsage={tokenUsage}
        />
      </div>
    </main>
  );
}
