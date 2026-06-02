export type ReceiptListFilters = {
  search?: string;
  merchant?: string;
  dateFrom?: string;
  dateTo?: string;
  receiptsOnly?: boolean;
  limit?: number;
};

export const MAX_EXPORT_ROWS = 200;
const DEFAULT_PREVIEW_LIMIT = 200;

export function parseReceiptFilters(
  searchParams: URLSearchParams,
): ReceiptListFilters {
  const search = searchParams.get("search")?.trim() || undefined;
  const merchant = searchParams.get("merchant")?.trim() || undefined;
  const dateFrom = searchParams.get("from")?.trim() || undefined;
  const dateTo = searchParams.get("to")?.trim() || undefined;
  const receiptsOnlyParam = searchParams.get("receiptsOnly");

  let receiptsOnly: boolean | undefined;

  if (receiptsOnlyParam === "true") {
    receiptsOnly = true;
  } else if (receiptsOnlyParam === "false") {
    receiptsOnly = false;
  }

  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  return {
    search,
    merchant,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    receiptsOnly,
    limit: Number.isFinite(limit) && limit! > 0 ? limit : undefined,
  };
}

export function receiptFiltersToSearchParams(
  filters: ReceiptListFilters,
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.merchant) {
    params.set("merchant", filters.merchant);
  }

  if (filters.dateFrom) {
    params.set("from", filters.dateFrom);
  }

  if (filters.dateTo) {
    params.set("to", filters.dateTo);
  }

  if (filters.receiptsOnly === true) {
    params.set("receiptsOnly", "true");
  } else if (filters.receiptsOnly === false) {
    params.set("receiptsOnly", "false");
  }

  return params;
}

export function getDefaultReceiptListFilters(): ReceiptListFilters {
  return {
    receiptsOnly: true,
  };
}

export function getPreviewReceiptListFilters(
  filters: ReceiptListFilters,
): ReceiptListFilters {
  return {
    ...filters,
    limit: DEFAULT_PREVIEW_LIMIT,
  };
}

export function getExportReceiptListFilters(
  filters: ReceiptListFilters,
): ReceiptListFilters {
  return {
    ...filters,
    limit: MAX_EXPORT_ROWS,
  };
}

/** Requires at least one narrowing filter (not receipts-only). */
export function hasActiveExportFilter(filters: ReceiptListFilters): boolean {
  return Boolean(
    filters.search?.trim() ||
      filters.merchant?.trim() ||
      filters.dateFrom?.trim() ||
      filters.dateTo?.trim(),
  );
}

export type ExportValidation = {
  allowed: boolean;
  message: string | null;
};

export function validateReceiptExport(
  filters: ReceiptListFilters,
  totalCount: number,
): ExportValidation {
  if (!hasActiveExportFilter(filters)) {
    return {
      allowed: false,
      message:
        "Add at least one filter (search, merchant, or date range), then apply filters before exporting.",
    };
  }

  if (totalCount === 0) {
    return {
      allowed: false,
      message: "No rows match these filters.",
    };
  }

  if (totalCount > MAX_EXPORT_ROWS) {
    return {
      allowed: false,
      message: `${totalCount} rows match. Narrow your filters to ${MAX_EXPORT_ROWS} rows or fewer to export.`,
    };
  }

  return {
    allowed: true,
    message: null,
  };
}
