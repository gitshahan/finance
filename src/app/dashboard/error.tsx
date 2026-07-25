"use client";

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-background p-6">
      <div className="max-w-md rounded-2xl border border-red-200 bg-surface p-6 text-center shadow-sm dark:border-red-900">
        <h1 className="font-display text-lg font-semibold tracking-display text-foreground">
          Could not load the dashboard
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {error.message ||
            "Something went wrong while loading your chat. Check server configuration and try again."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
