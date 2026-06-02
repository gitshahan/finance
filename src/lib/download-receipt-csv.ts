import {
  receiptFiltersToSearchParams,
  type ReceiptListFilters,
} from "@/lib/receipt-filters";

export async function downloadReceiptCsv(filters: ReceiptListFilters) {
  const params = receiptFiltersToSearchParams(filters);
  const response = await fetch(`/api/receipts/export?${params.toString()}`);

  if (!response.ok) {
    let message = "Could not export receipts.";

    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // Keep default message when response is not JSON.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition");
  const filenameMatch = disposition?.match(/filename="([^"]+)"/);
  const filename = filenameMatch?.[1] ?? "receipts.csv";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
