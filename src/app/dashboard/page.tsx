import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const { userId } = await auth();

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <section className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Dashboard
          </h1>
          <UserButton />
        </div>
        <p className="text-zinc-700 dark:text-zinc-300">
          You are signed in with Clerk.
        </p>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          User ID: {userId}
        </p>
      </section>
    </main>
  );
}
