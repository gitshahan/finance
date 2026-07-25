"use client";

import type { SpendSummaryResult } from "@/lib/shared-data-store";

function formatAmount(amount: number, currency: string | null) {
  const formatted = Number.isInteger(amount)
    ? amount.toString()
    : amount.toFixed(2);
  return currency ? `${currency} ${formatted}` : formatted;
}

type ChatSpendSummaryProps = {
  summary: SpendSummaryResult;
};

export function ChatSpendSummary({ summary }: ChatSpendSummaryProps) {
  if (summary.buckets.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No matching spend to summarize.
      </p>
    );
  }

  const groupLabel =
    summary.groupBy === "month"
      ? "Month"
      : summary.groupBy === "category"
        ? "Category"
        : "Merchant";

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="border-b border-zinc-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Spend by {summary.groupBy}
        {summary.totalAmount !== null
          ? ` · ${formatAmount(summary.totalAmount, summary.currency)} across ${summary.receiptCount} receipts`
          : ` · ${summary.receiptCount} receipts`}
      </div>
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">{groupLabel}</th>
              <th className="px-3 py-2 font-medium">Count</th>
              <th className="px-3 py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {summary.buckets.map((bucket) => {
              const max = Math.max(
                ...summary.buckets.map((item) => item.totalAmount),
                1,
              );
              const width = Math.max(8, Math.round((bucket.totalAmount / max) * 100));

              return (
                <tr
                  key={bucket.key}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{bucket.label}</div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="h-full rounded bg-zinc-700 dark:bg-zinc-300"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-300">
                    {bucket.count}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatAmount(bucket.totalAmount, bucket.currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function isSpendSummaryResult(
  value: unknown,
): value is SpendSummaryResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "groupBy" in value &&
    "buckets" in value &&
    Array.isArray((value as SpendSummaryResult).buckets)
  );
}
