import { auth } from "@clerk/nextjs/server";
import {
  getPreviewReceiptListFilters,
  hasActiveExportFilter,
  parseReceiptFilters,
  validateReceiptExport,
} from "@/lib/receipt-filters";
import {
  countSharedReceiptsForUser,
  isSharedDataConfigured,
  listSharedReceiptsForUser,
} from "@/lib/shared-data-store";

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isSharedDataConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured." },
      { status: 503 },
    );
  }

  const filters = parseReceiptFilters(new URL(request.url).searchParams);
  const totalCount = hasActiveExportFilter(filters)
    ? await countSharedReceiptsForUser(userId, filters)
    : 0;
  const validation = validateReceiptExport(filters, totalCount);
  const receipts =
    hasActiveExportFilter(filters) && totalCount > 0
      ? await listSharedReceiptsForUser(
          userId,
          getPreviewReceiptListFilters(filters),
        )
      : [];

  return Response.json({
    receipts,
    totalCount,
    exportAllowed: validation.allowed,
    exportMessage: validation.message,
  });
}
