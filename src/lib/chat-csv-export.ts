import { MAX_EXPORT_ROWS } from "@/lib/receipt-filters";
import { tableToCsv } from "@/lib/receipt-csv";

export type CsvDownloadToolOutput = {
  filename: string;
  csv: string;
  rowCount: number;
  truncated: boolean;
};

export type CsvDownloadToolError = {
  error: string;
};

function sanitizeCsvFilename(filename: string | undefined) {
  const fallback = `export-${new Date().toISOString().slice(0, 10)}.csv`;
  const raw = (filename?.trim() || fallback).replaceAll(/[/\\]/g, "");
  const base = raw.endsWith(".csv") ? raw : `${raw}.csv`;
  const safe = base.replaceAll(/[^a-zA-Z0-9._-]/g, "-").replaceAll(/-+/g, "-");

  return safe.length > 0 ? safe : fallback;
}

function rowRecordToValues(
  headers: string[],
  row: Record<string, string | number | boolean | null>,
) {
  return headers.map((header) => {
    const value = row[header];
    return value === undefined ? null : value;
  });
}

export function buildChatCsvDownload(input: {
  filename?: string;
  headers: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
}): CsvDownloadToolOutput | CsvDownloadToolError {
  const headers = input.headers.map((header) => header.trim()).filter(Boolean);

  if (headers.length === 0) {
    return { error: "At least one column header is required." };
  }

  if (input.rows.length === 0) {
    return { error: "At least one data row is required." };
  }

  const truncated = input.rows.length > MAX_EXPORT_ROWS;
  const limitedRows = input.rows.slice(0, MAX_EXPORT_ROWS);
  const csvRows = limitedRows.map((row) => rowRecordToValues(headers, row));
  const csv = tableToCsv(headers, csvRows);

  return {
    filename: sanitizeCsvFilename(input.filename),
    csv,
    rowCount: limitedRows.length,
    truncated,
  };
}
