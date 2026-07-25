import { del, get } from "@vercel/blob";
import type { UIMessage } from "ai";
import {
  guessReceiptUploadContentType,
  isCsvFilename,
} from "@/lib/receipt-image-url";

const MAX_CSV_CHARS_FOR_MODEL = 120_000;

export function getReceiptBlobPathPrefix(userId: string) {
  return `receipts/${userId}/`;
}

function getPathname(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

export function userOwnsReceiptBlobUrl(url: string, userId: string) {
  const prefix = `/${getReceiptBlobPathPrefix(userId)}`;
  const pathname = getPathname(url);

  if (!pathname) {
    return false;
  }

  // Segment-safe: must be under /receipts/<userId>/…
  return pathname === prefix.slice(0, -1) || pathname.startsWith(prefix);
}

export function isReceiptStorageBlobUrl(url: string) {
  const pathname = getPathname(url);
  if (!pathname) {
    return false;
  }

  return pathname === "/receipts" || pathname.startsWith("/receipts/");
}

/**
 * Reject file parts that are not owned receipt blobs (blocks arbitrary https:// URLs).
 */
export function messagesOnlyUseOwnedReceiptBlobs(
  userId: string,
  messages: UIMessage[],
): boolean {
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "file" && part.url) {
        // data: / blob: local previews are not persisted blob URLs
        if (part.url.startsWith("data:") || part.url.startsWith("blob:")) {
          continue;
        }

        if (!userOwnsReceiptBlobUrl(part.url, userId)) {
          return false;
        }
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
  return Promise.all(
    messages.map(async (message) => ({
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

            return {
              ...part,
              url: await fetchReceiptBlobAsDataUrl(part.url),
            };
          }

          // Drop non-owned / arbitrary remote file parts from model input.
          if (part.type === "file" && part.url && !part.url.startsWith("data:")) {
            return {
              type: "text" as const,
              text: "[Attached file omitted: not an owned receipt blob.]",
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
