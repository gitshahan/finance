import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { ChatInterface } from "@/components/chat-interface";
import {
  isChatPersistenceConfigured,
  loadMessagesByUser,
} from "@/lib/chat-store";

export default async function DashboardPage() {
  const { userId } = await auth();
  const chatPersistenceEnabled = isChatPersistenceConfigured();
  const initialMessages = userId ? await loadMessagesByUser(userId) : [];

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50 p-4 dark:bg-black sm:p-6">
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-4 overflow-hidden">
        <header className="flex shrink-0 items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Finance Chat
            </h1>
          </div>
          <UserButton />
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <ChatInterface
            initialMessages={initialMessages}
            chatPersistenceEnabled={chatPersistenceEnabled}
          />
        </div>
      </div>
    </main>
  );
}
