"use client";

import { useCallback, useEffect, useState } from "react";
import { useReceiptExport } from "@/contexts/receipt-export-context";
import type { SharedReceiptRecord } from "@/lib/shared-data-store";
import {
  getDefaultReceiptListFilters,
  hasActiveExportFilter,
  MAX_EXPORT_ROWS,
  receiptFiltersToSearchParams,
  type ReceiptListFilters,
} from "@/lib/receipt-filters";

type ReceiptsDataPanelProps = {
  sharedDataEnabled: boolean;
};

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatAmount(
  amount: number | null,
  currency: string | null,
): string {
  if (amount === null) {
    return "—";
  }

  const formatted = Number.isInteger(amount)
    ? amount.toString()
    : amount.toFixed(2);

  return currency ? `${currency} ${formatted}` : formatted;
}

export function ReceiptsDataPanel({
  sharedDataEnabled,
}: ReceiptsDataPanelProps) {
  const { setExportState, downloadCsv, isExporting, exportAllowed } =
    useReceiptExport();
  const [filters, setFilters] = useState<ReceiptListFilters | null>(null);
  const [draft, setDraft] = useState({
    search: "",
    merchant: "",
    dateFrom: "",
    dateTo: "",
    receiptsOnly: true,
  });
  const [receipts, setReceipts] = useState<SharedReceiptRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportReady, setExportReady] = useState(false);

  const loadReceipts = useCallback(
    async (activeFilters: ReceiptListFilters) => {
      if (!sharedDataEnabled) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const params = receiptFiltersToSearchParams(activeFilters);
        const response = await fetch(`/api/receipts?${params.toString()}`);

        if (!response.ok) {
          const message =
            response.status === 503
              ? "Receipt storage is not configured (DATABASE_URL)."
              : "Could not load receipts.";
          throw new Error(message);
        }

        const data = (await response.json()) as {
          receipts: SharedReceiptRecord[];
          totalCount: number;
          exportAllowed: boolean;
          exportMessage: string | null;
        };

        setReceipts(data.receipts);
        setTotalCount(data.totalCount);
        setExportReady(data.exportAllowed);
        setExportMessage(data.exportMessage);
        setExportState({
          filters: activeFilters,
          exportAllowed: data.exportAllowed,
        });
      } catch (loadError) {
        setReceipts([]);
        setTotalCount(0);
        setExportReady(false);
        setExportMessage(null);
        setExportState({ filters: null, exportAllowed: false });
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load receipts.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [setExportState, sharedDataEnabled],
  );

  useEffect(() => {
    if (!filters) {
      setExportState({ filters: null, exportAllowed: false });
    }
  }, [filters, setExportState]);

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();

    const nextFilters: ReceiptListFilters = {
      search: draft.search.trim() || undefined,
      merchant: draft.merchant.trim() || undefined,
      dateFrom: draft.dateFrom || undefined,
      dateTo: draft.dateTo || undefined,
      receiptsOnly: draft.receiptsOnly,
    };

    if (!hasActiveExportFilter(nextFilters)) {
      setError(
        "Add at least one filter (search, merchant, or date range) before applying.",
      );
      return;
    }

    setFilters(nextFilters);
    void loadReceipts(nextFilters);
  }

  function resetFilters() {
    setDraft({
      search: "",
      merchant: "",
      dateFrom: "",
      dateTo: "",
      receiptsOnly: getDefaultReceiptListFilters().receiptsOnly ?? true,
    });
    setFilters(null);
    setReceipts([]);
    setTotalCount(0);
    setExportReady(false);
    setExportMessage(null);
    setError(null);
    setExportState({ filters: null, exportAllowed: false });
  }

  async function handleDownloadCsv() {
    if (!sharedDataEnabled || !filters || !exportAllowed) {
      return;
    }

    setExportError(null);

    try {
      await downloadCsv();
    } catch (downloadError) {
      const message =
        downloadError instanceof Error
          ? downloadError.message
          : "Could not export receipts.";
      setExportError(message);
      setError(message);
    }
  }

  if (!sharedDataEnabled) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
        Set <code className="font-mono text-xs">DATABASE_URL</code> to save and
        export receipt data from Neon.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <form
        onSubmit={applyFilters}
        className="shrink-0 space-y-3 border-b border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Saved receipts
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Apply filters that match {MAX_EXPORT_ROWS} rows or fewer, then
              export as CSV. Bulk export of all data is not allowed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleDownloadCsv()}
            disabled={isExporting || isLoading || !exportAllowed}
            title={exportMessage ?? undefined}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isExporting ? "Exporting…" : "Download CSV"}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">
              Search
            </span>
            <input
              type="search"
              value={draft.search}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder="Merchant, summary, reference…"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">
              Merchant
            </span>
            <input
              type="text"
              value={draft.merchant}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  merchant: event.target.value,
                }))
              }
              placeholder="e.g. Starbucks"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">
              From date
            </span>
            <input
              type="date"
              value={draft.dateFrom}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dateFrom: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">
              To date
            </span>
            <input
              type="date"
              value={draft.dateTo}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dateTo: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={draft.receiptsOnly}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  receiptsOnly: event.target.checked,
                }))
              }
              className="size-4 rounded border-zinc-300"
            />
            Receipts only
          </label>

          <button
            type="submit"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Apply filters
          </button>

          <button
            type="button"
            onClick={resetFilters}
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Reset
          </button>
        </div>
      </form>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error || exportError ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
            {error ?? exportError}
          </div>
        ) : null}

        {exportMessage && filters ? (
          <div
            className={`mb-3 rounded-lg border p-3 text-sm ${
              exportReady
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
                : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
            }`}
          >
            {exportReady
              ? `${totalCount} row${totalCount === 1 ? "" : "s"} ready to export (max ${MAX_EXPORT_ROWS}).`
              : exportMessage}
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : !filters ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Add at least one filter (search, merchant, or date range), then
            click Apply filters to preview rows and enable CSV export.
          </p>
        ) : receipts.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No rows match these filters. Share receipt images in chat to build
            your export data.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
              Previewing {receipts.length} of {totalCount} matching row
              {totalCount === 1 ? "" : "s"}
            </p>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-50 text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Merchant</th>
                    <th className="px-3 py-2 font-medium">Receipt date</th>
                    <th className="px-3 py-2 font-medium">Total</th>
                    <th className="px-3 py-2 font-medium">Payment</th>
                    <th className="px-3 py-2 font-medium">Shared</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {receipts.map((receipt) => (
                    <tr key={receipt.id}>
                      <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">
                        {receipt.merchant ??
                          (receipt.isReceipt ? "—" : "Non-receipt")}
                      </td>
                      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                        {formatDate(receipt.receiptDate)}
                      </td>
                      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                        {formatAmount(receipt.totalAmount, receipt.currency)}
                      </td>
                      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                        {receipt.paymentMethod ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                        {formatDate(receipt.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
