import { tool, type UIMessage } from "ai";
import { z } from "zod";
import { buildChatCsvDownload } from "@/lib/chat-csv-export";
import { exportFilteredCsvFromMessages } from "@/lib/chat-csv-filter-export";
import { MAX_EXPORT_ROWS } from "@/lib/receipt-filters";

const csvCellValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const MAX_INLINE_EXPORT_ROWS = 30;

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
  })
  .superRefine((value, context) => {
    const hasInline = Boolean(value.headers?.length && value.rows?.length);
    const hasFilter = Boolean(value.filterFromAttachments);

    if (!hasInline && !hasFilter) {
      context.addIssue({
        code: "custom",
        message:
          "Provide filterFromAttachments for CSV exports, or headers and rows for small inline exports.",
      });
    }

    if (hasInline && hasFilter) {
      context.addIssue({
        code: "custom",
        message: "Use either filterFromAttachments or inline headers and rows, not both.",
      });
    }
  });

export type ChatToolsContext = {
  userId: string;
  messages: UIMessage[];
};

export function createChatTools(context: ChatToolsContext) {
  return {
    generateCsvDownload: tool({
      description:
        "Create a downloadable CSV file. For attached CSV files, always use filterFromAttachments (search terms, merchant names, etc.) so rows are filtered on the server. Only pass inline headers and rows for tiny exports under 30 rows.",
      inputSchema: generateCsvDownloadInputSchema,
      execute: async (input) => {
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
