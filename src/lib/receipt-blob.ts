import { del, get } from "@vercel/blob";
import type { UIMessage } from "ai";
import { guessImageContentType } from "@/lib/receipt-image-url";

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
  const contentType = result.blob.contentType ?? guessImageContentType(url);

  return `data:${contentType};base64,${buffer.toString("base64")}`;
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
