import { auth } from "@clerk/nextjs/server";
import {
  buildReceiptCsvFilename,
  sharedReceiptsToCsv,
} from "@/lib/receipt-csv";
import {
  getExportReceiptListFilters,
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
    return new Response("DATABASE_URL is not configured.", { status: 503 });
  }

  const filters = parseReceiptFilters(new URL(request.url).searchParams);
  const totalCount = await countSharedReceiptsForUser(userId, filters);
  const validation = validateReceiptExport(filters, totalCount);

  if (!validation.allowed) {
    return Response.json({ error: validation.message }, { status: 400 });
  }

  const receipts = await listSharedReceiptsForUser(
    userId,
    getExportReceiptListFilters(filters),
  );
  const csv = sharedReceiptsToCsv(receipts);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${buildReceiptCsvFilename()}"`,
      "Cache-Control": "no-store",
    },
  });
}
