import { generateObject, zodSchema } from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";
import { CHAT_MODEL } from "@/lib/ai-model";
import {
  extractReceiptBlobUrls,
  fetchReceiptBlobAsDataUrl,
} from "@/lib/receipt-blob";
import {
  getSharedReceiptByImageUrl,
  insertSharedReceipt,
  type InsertSharedReceiptInput,
} from "@/lib/shared-data-store";

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
    .optional(),
  summary: z
    .string()
    .describe("One short sentence describing this shared item for later lookup"),
  notReceiptDescription: z.string().nullable(),
});

type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;

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

export async function extractReceiptFromImage(
  imageDataUrl: string,
): Promise<ReceiptExtraction> {
  const { object } = await generateObject({
    model: CHAT_MODEL,
    schema: zodSchema(receiptExtractionSchema),
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

  return object;
}

export async function syncNewReceiptsFromMessages(
  userId: string,
  messages: UIMessage[],
) {
  const imageUrls = extractReceiptBlobUrls(messages, userId);

  for (const imageUrl of imageUrls) {
    const existing = await getSharedReceiptByImageUrl(userId, imageUrl);

    if (existing) {
      continue;
    }

    try {
      const imageDataUrl = await fetchReceiptBlobAsDataUrl(imageUrl);
      const extraction = await extractReceiptFromImage(imageDataUrl);
      const messageId = findMessageIdForImageUrl(messages, imageUrl);

      await insertSharedReceipt(
        toInsertInput(userId, messageId, imageUrl, extraction),
      );
    } catch (error) {
      console.error("Failed to index shared receipt:", imageUrl, error);
    }
  }
}
