import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { ChatInterface } from "@/components/chat-interface";
import { loadMessagesByUser } from "@/lib/chat-store";

export default async function DashboardPage() {
  const { userId } = await auth();
  const initialMessages = userId ? await loadMessagesByUser(userId) : [];

  return (
    <main className="flex flex-1 bg-zinc-50 p-4 dark:bg-black sm:p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-1 min-h-0 flex-col gap-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Finance Chat
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Your conversation is saved to Neon.
            </p>
          </div>
          <UserButton />
        </header>

        <div className="flex-1 min-h-0">
          <ChatInterface initialMessages={initialMessages} />
        </div>
      </div>
    </main>
  );
}
