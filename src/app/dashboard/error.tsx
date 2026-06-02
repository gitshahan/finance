"use client";

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 p-6 dark:bg-black">
      <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm dark:border-red-900 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Could not load the dashboard
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {error.message ||
            "Something went wrong while loading your chat. Check server configuration and try again."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
