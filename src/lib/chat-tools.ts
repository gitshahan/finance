import { tool, type UIMessage } from "ai";
import { z } from "zod";
import { buildChatCsvDownload } from "@/lib/chat-csv-export";
import { exportFilteredCsvFromMessages } from "@/lib/chat-csv-filter-export";
import {
  buildReceiptCsvFilename,
  sharedReceiptsToCsv,
} from "@/lib/receipt-csv";
import {
  getExportReceiptListFilters,
  hasActiveExportFilter,
  MAX_EXPORT_ROWS,
  validateReceiptExport,
  type ReceiptListFilters,
} from "@/lib/receipt-filters";
import { deleteReceiptBlobIfUnreferenced } from "@/lib/receipt-blob";
import {
  countSharedReceiptsBySourceUrl,
  countSharedReceiptsForUser,
  deleteSharedReceiptById,
  getSharedReceiptById,
  listSharedReceiptsForUser,
  searchSavedReceiptsForTool,
  setMerchantCategoryForUser,
  summarizeSharedReceiptSpend,
  updateSharedReceipt,
} from "@/lib/shared-data-store";

const csvCellValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const MAX_INLINE_EXPORT_ROWS = 30;

const savedReceiptFilterSchema = z.object({
  search: z
    .string()
    .optional()
    .describe("Free-text match across merchant, summary, reference, category."),
  merchant: z.string().optional().describe("Filter by merchant name (partial)."),
  category: z
    .string()
    .optional()
    .describe("Filter by category (partial), e.g. Groceries, Entertainment."),
  dateFrom: z
    .string()
    .optional()
    .describe("Inclusive start date YYYY-MM-DD or ISO datetime."),
  dateTo: z
    .string()
    .optional()
    .describe("Inclusive end date YYYY-MM-DD or ISO datetime."),
  receiptsOnly: z
    .boolean()
    .optional()
    .describe("When true (default for search), only payment receipts."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max rows to return (default 20, max 50)."),
});

const attachmentFilterSchema = z.object({
  sourceFilename: z
    .string()
    .optional()
    .describe(
      "Attached CSV filename when multiple CSVs exist. Omit to use the most recent attachment.",
    ),
  anyTermInRow: z
    .array(z.string().min(1))
    .optional()
    .describe(
      "Include a row when any column contains any of these terms (case-insensitive).",
    ),
  allTermsInRow: z
    .array(z.string().min(1))
    .optional()
    .describe(
      "Include a row only when every term appears somewhere in the row (case-insensitive).",
    ),
});

const generateCsvDownloadInputSchema = z
  .object({
    filename: z
      .string()
      .optional()
      .describe(
        "Suggested filename such as subscriptions-export.csv (no folders).",
      ),
    headers: z
      .array(z.string().min(1))
      .optional()
      .describe("Column headers for small inline exports only."),
    rows: z
      .array(z.record(z.string(), csvCellValue))
      .max(MAX_INLINE_EXPORT_ROWS)
      .optional()
      .describe(
        `Inline data rows for small exports only (at most ${MAX_INLINE_EXPORT_ROWS}).`,
      ),
    filterFromAttachments: attachmentFilterSchema
      .optional()
      .describe(
        `Preferred for CSV attachments. Filters rows server-side and exports up to ${MAX_EXPORT_ROWS} matches without sending row data in the tool call.`,
      ),
    filterFromSavedReceipts: savedReceiptFilterSchema
      .omit({ limit: true })
      .optional()
      .describe(
        `Export matching saved/indexed receipts (up to ${MAX_EXPORT_ROWS}). Requires at least one filter.`,
      ),
  })
  .superRefine((value, context) => {
    const hasInline = Boolean(value.headers?.length && value.rows?.length);
    const hasAttachmentFilter = Boolean(value.filterFromAttachments);
    const hasSavedFilter = Boolean(value.filterFromSavedReceipts);
    const modeCount = [hasInline, hasAttachmentFilter, hasSavedFilter].filter(
      Boolean,
    ).length;

    if (modeCount === 0) {
      context.addIssue({
        code: "custom",
        message:
          "Provide filterFromSavedReceipts, filterFromAttachments, or headers and rows for small inline exports.",
      });
    }

    if (modeCount > 1) {
      context.addIssue({
        code: "custom",
        message:
          "Use only one export mode: filterFromSavedReceipts, filterFromAttachments, or inline headers/rows.",
      });
    }
  });

function toReceiptFilters(
  input: z.infer<typeof savedReceiptFilterSchema>,
): ReceiptListFilters {
  return {
    search: input.search,
    merchant: input.merchant,
    category: input.category,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    receiptsOnly: input.receiptsOnly,
    limit: input.limit,
  };
}

async function exportSavedReceiptsCsv(
  userId: string,
  filters: ReceiptListFilters,
  filename?: string,
) {
  if (!hasActiveExportFilter(filters)) {
    return {
      error:
        "Add at least one filter (search, merchant, category, or date range) before exporting saved receipts.",
    };
  }

  const exportFilters = getExportReceiptListFilters({
    ...filters,
    receiptsOnly: filters.receiptsOnly ?? true,
  });
  const totalCount = await countSharedReceiptsForUser(userId, exportFilters);
  const validation = validateReceiptExport(exportFilters, totalCount);

  if (!validation.allowed) {
    return { error: validation.message ?? "Export not allowed." };
  }

  const receipts = await listSharedReceiptsForUser(userId, exportFilters);
  const csv = sharedReceiptsToCsv(receipts);

  return {
    filename: filename?.trim() || buildReceiptCsvFilename(),
    csv,
    rowCount: receipts.length,
    truncated: totalCount > receipts.length,
  };
}

export type ChatToolsContext = {
  userId: string;
  messages: UIMessage[];
};

export function createChatTools(context: ChatToolsContext) {
  return {
    searchSavedReceipts: tool({
      description:
        "Search the user's saved/indexed receipts. Use for historical questions instead of guessing from the short index summary.",
      inputSchema: savedReceiptFilterSchema,
      execute: async (input) => {
        return searchSavedReceiptsForTool(
          context.userId,
          toReceiptFilters(input),
        );
      },
    }),

    summarizeSpend: tool({
      description:
        "Aggregate spend from saved receipts by merchant, category, or month. Use for totals and breakdowns.",
      inputSchema: z.object({
        groupBy: z
          .enum(["merchant", "category", "month"])
          .describe("How to group totals."),
        search: z.string().optional(),
        merchant: z.string().optional(),
        category: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }),
      execute: async (input) => {
        const { groupBy, ...filterFields } = input;
        return summarizeSharedReceiptSpend(
          context.userId,
          groupBy,
          toReceiptFilters(filterFields),
        );
      },
    }),

    confirmSavedReceipt: tool({
      description:
        "Mark a saved receipt as user-confirmed after they agree the extracted fields are correct.",
      inputSchema: z.object({
        receiptId: z.string().describe("Saved receipt id from search results."),
      }),
      execute: async ({ receiptId }) => {
        const updated = await updateSharedReceipt(context.userId, receiptId, {
          confirmed: true,
        });

        if (!updated) {
          return { error: "Receipt not found." };
        }

        return {
          ok: true,
          receipt: {
            id: updated.id,
            merchant: updated.merchant,
            totalAmount: updated.totalAmount,
            currency: updated.currency,
            receiptDate: updated.receiptDate,
            confirmed: updated.confirmed,
          },
        };
      },
    }),

    updateSavedReceipt: tool({
      description:
        "Correct fields on a saved receipt after the user reports an extraction error.",
      inputSchema: z.object({
        receiptId: z.string(),
        merchant: z.string().nullable().optional(),
        receiptDate: z
          .string()
          .nullable()
          .optional()
          .describe("ISO date/datetime or null to clear."),
        totalAmount: z.number().nullable().optional(),
        currency: z.string().nullable().optional(),
        paymentMethod: z.string().nullable().optional(),
        referenceId: z.string().nullable().optional(),
        summary: z.string().nullable().optional(),
        category: z.string().nullable().optional(),
        isReceipt: z.boolean().optional(),
        confirmed: z.boolean().optional(),
      }),
      execute: async ({ receiptId, ...patch }) => {
        const parsedDate =
          patch.receiptDate === undefined
            ? undefined
            : patch.receiptDate === null
              ? null
              : Number.isNaN(Date.parse(patch.receiptDate))
                ? undefined
                : new Date(patch.receiptDate).toISOString();

        if (patch.receiptDate && parsedDate === undefined) {
          return { error: "Invalid receiptDate; use ISO date or datetime." };
        }

        const updated = await updateSharedReceipt(context.userId, receiptId, {
          ...patch,
          receiptDate: parsedDate,
          confirmed: patch.confirmed ?? true,
        });

        if (!updated) {
          return { error: "Receipt not found." };
        }

        return {
          ok: true,
          receipt: {
            id: updated.id,
            merchant: updated.merchant,
            receiptDate: updated.receiptDate,
            totalAmount: updated.totalAmount,
            currency: updated.currency,
            paymentMethod: updated.paymentMethod,
            referenceId: updated.referenceId,
            summary: updated.summary,
            category: updated.category,
            confirmed: updated.confirmed,
            isReceipt: updated.isReceipt,
          },
        };
      },
    }),

    deleteSavedReceipt: tool({
      description:
        "Delete a saved receipt from the index. Also removes the source blob when nothing else references it.",
      inputSchema: z.object({
        receiptId: z.string(),
      }),
      execute: async ({ receiptId }) => {
        const existing = await getSharedReceiptById(context.userId, receiptId);
        if (!existing) {
          return { error: "Receipt not found." };
        }

        await deleteSharedReceiptById(context.userId, receiptId);
        const remaining = await countSharedReceiptsBySourceUrl(
          context.userId,
          existing.sourceUrl,
        );
        await deleteReceiptBlobIfUnreferenced(
          context.userId,
          existing.sourceUrl,
          context.messages,
          remaining,
        );

        return {
          ok: true,
          deletedId: receiptId,
          merchant: existing.merchant,
        };
      },
    }),

    setMerchantCategory: tool({
      description:
        "Remember a category for a merchant and apply it to matching saved receipts (e.g. treat Netflix as Entertainment).",
      inputSchema: z.object({
        merchant: z.string().min(1),
        category: z.string().min(1),
      }),
      execute: async ({ merchant, category }) => {
        try {
          const result = await setMerchantCategoryForUser(
            context.userId,
            merchant,
            category,
          );
          return { ok: true, ...result };
        } catch (error) {
          return {
            error:
              error instanceof Error
                ? error.message
                : "Unable to save merchant category.",
          };
        }
      },
    }),

    generateCsvDownload: tool({
      description:
        "Create a downloadable CSV. Prefer filterFromSavedReceipts for indexed receipts, filterFromAttachments for chat CSV files, or tiny inline headers/rows (<30).",
      inputSchema: generateCsvDownloadInputSchema,
      execute: async (input) => {
        if (input.filterFromSavedReceipts) {
          return exportSavedReceiptsCsv(
            context.userId,
            toReceiptFilters(input.filterFromSavedReceipts),
            input.filename,
          );
        }

        if (input.filterFromAttachments) {
          return exportFilteredCsvFromMessages(
            context.userId,
            context.messages,
            {
              filename: input.filename,
              filterFromAttachments: input.filterFromAttachments,
            },
          );
        }

        return buildChatCsvDownload({
          filename: input.filename,
          headers: input.headers ?? [],
          rows: input.rows ?? [],
        });
      },
    }),
  };
}
