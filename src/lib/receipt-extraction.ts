import { generateObject, zodSchema } from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";
import { CHAT_MODEL } from "@/lib/ai-model";
import {
  extractReceiptBlobUrls,
  fetchReceiptBlobAsDataUrl,
} from "@/lib/receipt-blob";
import { isCsvFilename } from "@/lib/receipt-image-url";
import {
  getSharedReceiptByImageUrl,
  insertSharedReceipt,
  type InsertSharedReceiptInput,
} from "@/lib/shared-data-store";
import type { TokenReservation } from "@/lib/token-usage-store";

/** Cap vision generateObject calls per chat request to limit cost amplification. */
export const MAX_NEW_EXTRACTIONS_PER_REQUEST = 2;

const receiptExtractionSchema = z.object({
  isReceipt: z.boolean(),
  merchant: z.string().nullable(),
  receiptDate: z
    .string()
    .nullable()
    .describe("ISO 8601 date or datetime when visible on the receipt"),
  totalAmount: z.number().nullable(),
  currency: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  referenceId: z.string().nullable(),
  taxAmount: z.number().nullable(),
  lineItems: z
    .array(
      z.object({
        description: z.string(),
        amount: z.number().nullable(),
      }),
    )
    .max(50)
    .optional(),
  summary: z
    .string()
    .describe("One short sentence describing this shared item for later lookup"),
  notReceiptDescription: z.string().nullable(),
});

type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;

function isCsvBlobUrl(url: string) {
  try {
    return isCsvFilename(new URL(url).pathname);
  } catch {
    return isCsvFilename(url);
  }
}

function findMessageIdForImageUrl(
  messages: UIMessage[],
  imageUrl: string,
): string | null {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    for (const part of message.parts) {
      if (part.type === "file" && part.url === imageUrl) {
        return message.id;
      }
    }
  }

  return null;
}

function parseReceiptDate(value: string | null): string | null {
  if (!value?.trim()) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function toInsertInput(
  userId: string,
  messageId: string | null,
  imageUrl: string,
  extraction: ReceiptExtraction,
): InsertSharedReceiptInput {
  return {
    id: crypto.randomUUID(),
    userId,
    messageId,
    imageUrl,
    isReceipt: extraction.isReceipt,
    merchant: extraction.merchant,
    receiptDate: parseReceiptDate(extraction.receiptDate),
    totalAmount: extraction.totalAmount,
    currency: extraction.currency,
    paymentMethod: extraction.paymentMethod,
    referenceId: extraction.referenceId,
    summary: extraction.isReceipt
      ? extraction.summary
      : (extraction.notReceiptDescription ?? extraction.summary),
    details: {
      taxAmount: extraction.taxAmount,
      lineItems: extraction.lineItems ?? [],
      notReceiptDescription: extraction.notReceiptDescription,
    },
  };
}

function emptyUsage(): TokenReservation {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function addUsage(a: TokenReservation, b: TokenReservation): TokenReservation {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

/** Count image blob URLs that may need vision indexing (excludes CSV). */
export function countCandidateReceiptExtractions(
  userId: string,
  messages: UIMessage[],
): number {
  return extractReceiptBlobUrls(messages, userId).filter(
    (url) => !isCsvBlobUrl(url),
  ).length;
}

export async function extractReceiptFromImage(
  imageDataUrl: string,
): Promise<{ object: ReceiptExtraction; usage: TokenReservation }> {
  const { object, usage } = await generateObject({
    model: CHAT_MODEL,
    schema: zodSchema(receiptExtractionSchema),
    maxOutputTokens: 800,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract structured fields from this image. Use only visible information. Use null when a field is missing or unreadable.",
          },
          {
            type: "image",
            image: imageDataUrl,
          },
        ],
      },
    ],
  });

  return {
    object,
    usage: {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      totalTokens:
        usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    },
  };
}

export type SyncNewReceiptsResult = {
  extractedCount: number;
  usage: TokenReservation;
};

export async function syncNewReceiptsFromMessages(
  userId: string,
  messages: UIMessage[],
  options?: { maxNewExtractions?: number },
): Promise<SyncNewReceiptsResult> {
  const maxNewExtractions = Math.max(
    0,
    Math.trunc(options?.maxNewExtractions ?? MAX_NEW_EXTRACTIONS_PER_REQUEST),
  );
  const imageUrls = extractReceiptBlobUrls(messages, userId);
  let extractedCount = 0;
  let usage = emptyUsage();

  for (const imageUrl of imageUrls) {
    if (extractedCount >= maxNewExtractions) {
      break;
    }

    if (isCsvBlobUrl(imageUrl)) {
      continue;
    }

    const existing = await getSharedReceiptByImageUrl(userId, imageUrl);

    if (existing) {
      continue;
    }

    try {
      const imageDataUrl = await fetchReceiptBlobAsDataUrl(imageUrl);
      const { object: extraction, usage: extractionUsage } =
        await extractReceiptFromImage(imageDataUrl);
      const messageId = findMessageIdForImageUrl(messages, imageUrl);

      await insertSharedReceipt(
        toInsertInput(userId, messageId, imageUrl, extraction),
      );
      usage = addUsage(usage, extractionUsage);
      extractedCount += 1;
    } catch (error) {
      console.error("Failed to index shared receipt:", imageUrl, error);
    }
  }

  return { extractedCount, usage };
}
