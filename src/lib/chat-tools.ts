import { tool } from "ai";
import { z } from "zod";
import { buildChatCsvDownload } from "@/lib/chat-csv-export";
import { MAX_EXPORT_ROWS } from "@/lib/receipt-filters";

const csvCellValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const generateCsvDownloadTool = tool({
  description:
    "Create a downloadable CSV file from tabular receipt or transaction data. Use when the user asks to export, download, or save data as CSV.",
  inputSchema: z.object({
    filename: z
      .string()
      .optional()
      .describe(
        "Suggested filename such as transactions-export.csv (no folders).",
      ),
    headers: z
      .array(z.string().min(1))
      .min(1)
      .describe("Column headers in display order."),
    rows: z
      .array(z.record(z.string(), csvCellValue))
      .min(1)
      .max(MAX_EXPORT_ROWS)
      .describe(
        `Data rows as objects keyed by header name. At most ${MAX_EXPORT_ROWS} rows.`,
      ),
  }),
  execute: async (input) => buildChatCsvDownload(input),
});

export const chatTools = {
  generateCsvDownload: generateCsvDownloadTool,
};
