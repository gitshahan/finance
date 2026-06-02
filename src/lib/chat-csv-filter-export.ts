import type { UIMessage } from "ai";
import {
  buildChatCsvDownload,
  type CsvDownloadToolError,
  type CsvDownloadToolOutput,
} from "@/lib/chat-csv-export";
import { parseCsv } from "@/lib/csv-parse";
import {
  fetchReceiptBlobAsText,
  userOwnsReceiptBlobUrl,
} from "@/lib/receipt-blob";
import { isCsvFilename } from "@/lib/receipt-image-url";
import { MAX_EXPORT_ROWS } from "@/lib/receipt-filters";

export type CsvAttachmentFilter = {
  sourceFilename?: string;
  anyTermInRow?: string[];
  allTermsInRow?: string[];
};

type CsvAttachment = {
  filename: string;
  text: string;
};

function isCsvFilePart(part: {
  mediaType?: string;
  filename?: string;
  url?: string;
}) {
  if (part.mediaType === "text/csv") {
    return true;
  }

  if (part.filename && isCsvFilename(part.filename)) {
    return true;
  }

  if (part.url) {
    try {
      return isCsvFilename(new URL(part.url).pathname);
    } catch {
      return isCsvFilename(part.url);
    }
  }

  return false;
}

function normalizeFilename(filename: string | undefined) {
  return (filename ?? "upload.csv").trim().toLowerCase();
}

function rowMatchesFilter(row: string[], filter: CsvAttachmentFilter) {
  const haystack = row.join("\u0001").toLowerCase();

  if (filter.allTermsInRow?.length) {
    return filter.allTermsInRow.every((term) =>
      haystack.includes(term.trim().toLowerCase()),
    );
  }

  if (filter.anyTermInRow?.length) {
    return filter.anyTermInRow.some((term) =>
      haystack.includes(term.trim().toLowerCase()),
    );
  }

  return true;
}

function parsedRowsToRecords(headers: string[], rows: string[][]) {
  return rows.map((row) => {
    const record: Record<string, string | null> = {};

    for (let index = 0; index < headers.length; index += 1) {
      const header = headers[index];
      if (!header) {
        continue;
      }

      record[header] = row[index] ?? null;
    }

    return record;
  });
}

async function listCsvAttachments(
  userId: string,
  messages: UIMessage[],
): Promise<CsvAttachment[]> {
  const attachments: CsvAttachment[] = [];

  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type !== "file" ||
        !part.url ||
        !userOwnsReceiptBlobUrl(part.url, userId) ||
        !isCsvFilePart(part)
      ) {
        continue;
      }

      const text = await fetchReceiptBlobAsText(part.url);
      attachments.push({
        filename: part.filename ?? "upload.csv",
        text,
      });
    }
  }

  return attachments;
}

function pickCsvAttachment(
  attachments: CsvAttachment[],
  sourceFilename: string | undefined,
): CsvAttachment | CsvDownloadToolError {
  if (attachments.length === 0) {
    return {
      error:
        "No CSV file found in this chat. Ask the user to attach a CSV, then try again.",
    };
  }

  if (!sourceFilename?.trim()) {
    return attachments[attachments.length - 1]!;
  }

  const wanted = normalizeFilename(sourceFilename);
  const match = attachments.find(
    (attachment) => normalizeFilename(attachment.filename) === wanted,
  );

  if (!match) {
    return {
      error: `No attached CSV named "${sourceFilename}". Available: ${attachments.map((item) => item.filename).join(", ")}.`,
    };
  }

  return match;
}

export async function exportFilteredCsvFromMessages(
  userId: string,
  messages: UIMessage[],
  input: {
    filename?: string;
    filterFromAttachments: CsvAttachmentFilter;
  },
): Promise<CsvDownloadToolOutput | CsvDownloadToolError> {
  const attachments = await listCsvAttachments(userId, messages);
  const picked = pickCsvAttachment(
    attachments,
    input.filterFromAttachments.sourceFilename,
  );

  if ("error" in picked) {
    return picked;
  }

  const parsed = parseCsv(picked.text);

  if (parsed.headers.length === 0) {
    return { error: "The CSV file has no header row." };
  }

  const filteredRows = parsed.rows.filter((row) =>
    rowMatchesFilter(row, input.filterFromAttachments),
  );

  if (filteredRows.length === 0) {
    return { error: "No rows matched the export filter." };
  }

  return buildChatCsvDownload({
    filename: input.filename,
    headers: parsed.headers,
    rows: parsedRowsToRecords(parsed.headers, filteredRows),
  });
}
