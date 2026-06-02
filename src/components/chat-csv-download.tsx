"use client";

import type {
  CsvDownloadToolError,
  CsvDownloadToolOutput,
} from "@/lib/chat-csv-export";

type ChatCsvDownloadProps = {
  output: CsvDownloadToolOutput | CsvDownloadToolError;
};

function isCsvDownloadError(
  output: CsvDownloadToolOutput | CsvDownloadToolError,
): output is CsvDownloadToolError {
  return "error" in output;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.click();
  URL.revokeObjectURL(url);
}

export function ChatCsvDownload({ output }: ChatCsvDownloadProps) {
  if (isCsvDownloadError(output)) {
    return (
      <p className="text-sm text-red-700 dark:text-red-300">{output.error}</p>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-900/60">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        CSV ready
      </p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {output.rowCount} row{output.rowCount === 1 ? "" : "s"}
        {output.truncated ? " (first 200 rows; additional rows omitted)" : ""}
      </p>
      <button
        type="button"
        onClick={() => downloadCsv(output.filename, output.csv)}
        className="mt-3 inline-flex items-center rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Download {output.filename}
      </button>
    </div>
  );
}
