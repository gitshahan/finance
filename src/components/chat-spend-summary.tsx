"use client";

import type { SpendSummaryResult } from "@/lib/shared-data-store";

function formatAmount(amount: number, currency: string | null) {
  const formatted = Number.isInteger(amount)
    ? amount.toString()
    : amount.toFixed(2);
  return currency ? `${currency} ${formatted}` : formatted;
}

function formatAxisAmount(amount: number) {
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`;
  }
  return Number.isInteger(amount) ? amount.toString() : amount.toFixed(0);
}

function formatChartLabel(label: string, groupBy: SpendSummaryResult["groupBy"]) {
  if (groupBy === "month" && /^\d{4}-\d{2}$/.test(label)) {
    const [year, month] = label.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleString("en-US", { month: "short", year: "2-digit" });
  }
  if (label.length > 12) {
    return `${label.slice(0, 11)}…`;
  }
  return label;
}

type ChatSpendSummaryProps = {
  summary: SpendSummaryResult;
};

function SpendBarChart({ summary }: { summary: SpendSummaryResult }) {
  const width = 640;
  const height = 280;
  const padding = { top: 20, right: 16, bottom: 48, left: 48 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxAmount = Math.max(
    ...summary.buckets.map((bucket) => bucket.totalAmount),
    1,
  );
  const barGap = Math.min(12, plotWidth / summary.buckets.length / 4);
  const barWidth = Math.max(
    8,
    (plotWidth - barGap * (summary.buckets.length + 1)) /
      summary.buckets.length,
  );
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    return (maxAmount / tickCount) * index;
  });

  return (
    <div className="overflow-x-auto px-2 pb-2 pt-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[280px]"
        role="img"
        aria-label={`Spend by ${summary.groupBy} chart`}
      >
        {ticks.map((tick) => {
          const y =
            padding.top + plotHeight - (tick / maxAmount) * plotHeight;
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-muted text-[11px]"
              >
                {formatAxisAmount(tick)}
              </text>
            </g>
          );
        })}

        {summary.buckets.map((bucket, index) => {
          const barHeight = (bucket.totalAmount / maxAmount) * plotHeight;
          const x = padding.left + barGap + index * (barWidth + barGap);
          const y = padding.top + plotHeight - barHeight;
          const label = formatChartLabel(bucket.label, summary.groupBy);

          return (
            <g key={bucket.key}>
              <title>
                {bucket.label}: {formatAmount(bucket.totalAmount, bucket.currency)}{" "}
                ({bucket.count} receipts)
              </title>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 2)}
                rx={4}
                className="fill-brand"
              />
              <text
                x={x + barWidth / 2}
                y={height - padding.bottom + 16}
                textAnchor="middle"
                className="fill-muted text-[10px]"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SpendTable({ summary }: { summary: SpendSummaryResult }) {
  const groupLabel =
    summary.groupBy === "month"
      ? "Month"
      : summary.groupBy === "category"
        ? "Category"
        : "Merchant";

  return (
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
            const width = Math.max(
              8,
              Math.round((bucket.totalAmount / max) * 100),
            );

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
  );
}

export function ChatSpendSummary({ summary }: ChatSpendSummaryProps) {
  if (summary.buckets.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No matching spend to summarize.
      </p>
    );
  }

  const isChart = summary.display === "chart";

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="border-b border-zinc-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Spend by {summary.groupBy}
        {summary.totalAmount !== null
          ? ` · ${formatAmount(summary.totalAmount, summary.currency)} across ${summary.receiptCount} receipts`
          : ` · ${summary.receiptCount} receipts`}
      </div>
      {isChart ? (
        <SpendBarChart summary={summary} />
      ) : (
        <SpendTable summary={summary} />
      )}
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

export function isChartSpendSummary(
  value: unknown,
): value is SpendSummaryResult {
  return isSpendSummaryResult(value) && value.display === "chart";
}
