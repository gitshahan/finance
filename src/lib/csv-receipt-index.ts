import type { UIMessage } from "ai";
import { parseCsv } from "@/lib/csv-parse";
import {
  extractReceiptBlobUrls,
  fetchReceiptBlobAsText,
} from "@/lib/receipt-blob";
import { isCsvFilename } from "@/lib/receipt-image-url";
import {
  findDuplicateSharedReceipt,
  getSharedReceiptByImageUrl,
  insertSharedReceipt,
} from "@/lib/shared-data-store";

const MAX_CSV_ROWS_PER_FILE = 200;
const MAX_CSV_FILES_PER_REQUEST = 2;

function isCsvBlobUrl(url: string) {
  try {
    return isCsvFilename(new URL(url).pathname);
  } catch {
    return isCsvFilename(url);
  }
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function findColumnIndex(headers: string[], candidates: string[]) {
  const normalized = headers.map(normalizeHeader);
  for (const candidate of candidates) {
    const index = normalized.indexOf(candidate);
    if (index >= 0) {
      return index;
    }
  }
  return -1;
}

function cellAt(row: string[], index: number): string | null {
  if (index < 0 || index >= row.length) {
    return null;
  }

  const value = row[index]?.trim();
  return value ? value : null;
}

function parseAmount(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") {
    return null;
  }

  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function parseDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function findMessageIdForUrl(
  messages: UIMessage[],
  url: string,
): string | null {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    for (const part of message.parts) {
      if (part.type === "file" && part.url === url) {
        return message.id;
      }
    }
  }

  return null;
}

export function mapCsvRowToReceiptFields(
  headers: string[],
  row: string[],
): {
  merchant: string | null;
  receiptDate: string | null;
  totalAmount: number | null;
  currency: string | null;
  paymentMethod: string | null;
  referenceId: string | null;
  summary: string | null;
} {
  const merchantIndex = findColumnIndex(headers, [
    "merchant",
    "payee",
    "vendor",
    "description",
    "name",
    "store",
  ]);
  const dateIndex = findColumnIndex(headers, [
    "date",
    "receipt_date",
    "transaction_date",
    "posted_date",
    "time",
  ]);
  const amountIndex = findColumnIndex(headers, [
    "amount",
    "total",
    "total_amount",
    "debit",
    "price",
  ]);
  const currencyIndex = findColumnIndex(headers, [
    "currency",
    "currency_code",
    "ccy",
  ]);
  const paymentIndex = findColumnIndex(headers, [
    "payment_method",
    "payment",
    "method",
    "card",
  ]);
  const referenceIndex = findColumnIndex(headers, [
    "reference",
    "reference_id",
    "transaction_id",
    "id",
    "ref",
  ]);

  const merchant = cellAt(row, merchantIndex);
  const receiptDate = parseDate(cellAt(row, dateIndex));
  const totalAmount = parseAmount(cellAt(row, amountIndex));
  const currency = cellAt(row, currencyIndex);
  const paymentMethod = cellAt(row, paymentIndex);
  const referenceId = cellAt(row, referenceIndex);

  const summaryParts = [
    merchant,
    receiptDate ? receiptDate.slice(0, 10) : null,
    totalAmount !== null
      ? currency
        ? `${currency} ${totalAmount}`
        : String(totalAmount)
      : null,
  ].filter(Boolean);

  return {
    merchant,
    receiptDate,
    totalAmount,
    currency,
    paymentMethod,
    referenceId,
    summary:
      summaryParts.length > 0
        ? summaryParts.join(" · ")
        : row.filter(Boolean).slice(0, 4).join(" · ") || "CSV row",
  };
}

export function csvRowSourceKey(sourceUrl: string, rowIndex: number) {
  return `${sourceUrl}#csv-row=${rowIndex}`;
}

export type SyncCsvReceiptsResult = {
  indexedCount: number;
  skippedDuplicates: number;
  filesProcessed: number;
};

export async function syncCsvReceiptsFromMessages(
  userId: string,
  messages: UIMessage[],
  options?: { maxFiles?: number; maxRowsPerFile?: number },
): Promise<SyncCsvReceiptsResult> {
  const maxFiles = Math.max(
    0,
    Math.trunc(options?.maxFiles ?? MAX_CSV_FILES_PER_REQUEST),
  );
  const maxRowsPerFile = Math.max(
    0,
    Math.trunc(options?.maxRowsPerFile ?? MAX_CSV_ROWS_PER_FILE),
  );

  const csvUrls = extractReceiptBlobUrls(messages, userId).filter(isCsvBlobUrl);
  let indexedCount = 0;
  let skippedDuplicates = 0;
  let filesProcessed = 0;

  for (const sourceUrl of csvUrls) {
    if (filesProcessed >= maxFiles) {
      break;
    }

    try {
      const text = await fetchReceiptBlobAsText(sourceUrl);
      const parsed = parseCsv(text);

      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        filesProcessed += 1;
        continue;
      }

      const messageId = findMessageIdForUrl(messages, sourceUrl);
      const rows = parsed.rows.slice(0, maxRowsPerFile);

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex]!;
        const imageUrl = csvRowSourceKey(sourceUrl, rowIndex);
        const existing = await getSharedReceiptByImageUrl(userId, imageUrl);

        if (existing) {
          continue;
        }

        const fields = mapCsvRowToReceiptFields(parsed.headers, row);
        const hasSignal =
          Boolean(fields.merchant) ||
          fields.totalAmount !== null ||
          Boolean(fields.receiptDate);

        if (!hasSignal) {
          continue;
        }

        const duplicate = await findDuplicateSharedReceipt(userId, fields);
        if (duplicate) {
          skippedDuplicates += 1;
          continue;
        }

        await insertSharedReceipt({
          id: crypto.randomUUID(),
          userId,
          messageId,
          imageUrl,
          sourceType: "csv",
          sourceUrl,
          isReceipt: true,
          merchant: fields.merchant,
          receiptDate: fields.receiptDate,
          totalAmount: fields.totalAmount,
          currency: fields.currency,
          paymentMethod: fields.paymentMethod,
          referenceId: fields.referenceId,
          summary: fields.summary,
          details: {
            csvRowIndex: rowIndex,
            csvHeaders: parsed.headers,
            csvCells: row,
          },
        });
        indexedCount += 1;
      }

      filesProcessed += 1;
    } catch (error) {
      console.error("Failed to index CSV receipts:", sourceUrl, error);
    }
  }

  return { indexedCount, skippedDuplicates, filesProcessed };
}
