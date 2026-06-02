import type { SharedReceiptRecord } from "@/lib/shared-data-store";

function escapeCsvCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function formatCsvRow(
  values: Array<string | number | boolean | null | undefined>,
) {
  return values.map(escapeCsvCell).join(",");
}

export function tableToCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
) {
  return `\uFEFF${[formatCsvRow(headers), ...rows.map(formatCsvRow)].join("\n")}`;
}

export function sharedReceiptsToCsv(receipts: SharedReceiptRecord[]) {
  const headers = [
    "id",
    "is_receipt",
    "merchant",
    "receipt_date",
    "total_amount",
    "currency",
    "payment_method",
    "reference_id",
    "summary",
    "tax_amount",
    "shared_at",
  ];

  const rows = receipts.map((receipt) => {
    const taxAmount =
      typeof receipt.details.taxAmount === "number"
        ? receipt.details.taxAmount
        : null;

    return [
      receipt.id,
      receipt.isReceipt,
      receipt.merchant,
      receipt.receiptDate,
      receipt.totalAmount,
      receipt.currency,
      receipt.paymentMethod,
      receipt.referenceId,
      receipt.summary,
      taxAmount,
      receipt.createdAt,
    ];
  });

  return tableToCsv(headers, rows);
}

export function buildReceiptCsvFilename() {
  const date = new Date().toISOString().slice(0, 10);
  return `receipts-${date}.csv`;
}
