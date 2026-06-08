import { del, get } from "@vercel/blob";
import type { UIMessage } from "ai";
import {
  guessReceiptUploadContentType,
  isCsvFilename,
} from "@/lib/receipt-image-url";

const MAX_CSV_CHARS_FOR_MODEL = 120_000;

/** Keep only the most recent turns to bound history tokens (FIFO sliding window). */
const MAX_HISTORY_MESSAGES = Math.max(
  2,
  Number.parseInt(process.env.CHAT_MAX_HISTORY_MESSAGES ?? "12", 10) || 12,
);

export function applyHistoryWindow(
  messages: UIMessage[],
  max = MAX_HISTORY_MESSAGES,
): UIMessage[] {
  return messages.length <= max ? messages : messages.slice(-max);
}

function findLastUserIndex(messages: UIMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return index;
    }
  }

  return messages.length - 1;
}

export function getReceiptBlobPathPrefix(userId: string) {
  return `receipts/${userId}/`;
}

export function userOwnsReceiptBlobUrl(url: string, userId: string) {
  const prefix = getReceiptBlobPathPrefix(userId);

  try {
    return new URL(url).pathname.includes(prefix);
  } catch {
    return url.includes(prefix);
  }
}

function isReceiptStorageBlobUrl(url: string) {
  try {
    return new URL(url).pathname.includes("/receipts/");
  } catch {
    return url.includes("/receipts/");
  }
}

export function messagesOnlyUseOwnedReceiptBlobs(
  userId: string,
  messages: UIMessage[],
): boolean {
  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === "file" &&
        part.url &&
        isReceiptStorageBlobUrl(part.url) &&
        !userOwnsReceiptBlobUrl(part.url, userId)
      ) {
        return false;
      }
    }
  }

  return true;
}

export function extractReceiptBlobUrls(
  messages: UIMessage[],
  userId: string,
): string[] {
  const urls = new Set<string>();

  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === "file" &&
        part.url &&
        userOwnsReceiptBlobUrl(part.url, userId)
      ) {
        urls.add(part.url);
      }
    }
  }

  return [...urls];
}

export async function fetchReceiptBlobAsDataUrl(url: string) {
  const result = await get(url, { access: "private" });

  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error("Receipt image not found in blob storage.");
  }

  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  const contentType = result.blob.contentType ?? guessReceiptUploadContentType(url);

  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

export async function fetchReceiptBlobAsText(url: string) {
  const result = await get(url, { access: "private" });

  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error("Receipt file not found in blob storage.");
  }

  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  return buffer.toString("utf-8");
}

function isCsvFilePart(part: { mediaType?: string; filename?: string; url?: string }) {
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

function formatCsvForModel(filename: string | undefined, csvText: string) {
  const label = filename ?? "upload.csv";
  let body = csvText;

  if (body.length > MAX_CSV_CHARS_FOR_MODEL) {
    body = `${body.slice(0, MAX_CSV_CHARS_FOR_MODEL)}\n\n[CSV truncated for length]`;
  }

  return `The user attached a CSV file named "${label}":\n\n${body}`;
}

export async function prepareMessagesForModel(
  userId: string,
  messages: UIMessage[],
): Promise<UIMessage[]> {
  const windowed = applyHistoryWindow(messages);
  const lastUserIndex = findLastUserIndex(windowed);

  return Promise.all(
    windowed.map(async (message, index) => ({
      ...message,
      parts: await Promise.all(
        message.parts.map(async (part) => {
          if (
            part.type === "file" &&
            part.url &&
            userOwnsReceiptBlobUrl(part.url, userId)
          ) {
            if (isCsvFilePart(part)) {
              const csvText = await fetchReceiptBlobAsText(part.url);
              return {
                type: "text" as const,
                text: formatCsvForModel(part.filename, csvText),
              };
            }

            // Only inline the (expensive) base64 image for the current turn.
            // Older receipt images are already captured in the saved receipt
            // records context, so replace them with a lightweight reference to
            // avoid re-sending full image payloads on every request.
            if (index < lastUserIndex) {
              const label = part.filename ?? "image";
              return {
                type: "text" as const,
                text: `[Earlier image attachment "${label}". Refer to the saved receipt records for its extracted details.]`,
              };
            }

            return {
              ...part,
              url: await fetchReceiptBlobAsDataUrl(part.url),
            };
          }

          return part;
        }),
      ),
    })),
  );
}

export async function deleteOrphanedReceiptBlobs(
  userId: string,
  previousMessages: UIMessage[],
  nextMessages: UIMessage[],
) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return;
  }

  const previousUrls = new Set(extractReceiptBlobUrls(previousMessages, userId));
  const nextUrls = new Set(extractReceiptBlobUrls(nextMessages, userId));
  const orphanedUrls = [...previousUrls].filter((url) => !nextUrls.has(url));

  if (orphanedUrls.length === 0) {
    return;
  }

  await Promise.all(
    orphanedUrls.map(async (url) => {
      try {
        await del(url);
      } catch (error) {
        console.error("Failed to delete orphaned receipt blob:", url, error);
      }
    }),
  );
}
