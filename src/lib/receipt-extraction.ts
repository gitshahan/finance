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

// Short keys cut output tokens; mapped back to descriptive fields in toInsertInput.
const receiptExtractionSchema = z.object({
  rcpt: z.boolean().describe("true if the image is a payment receipt"),
  mrch: z.string().nullable().describe("merchant or payee"),
  date: z
    .string()
    .nullable()
    .describe("ISO 8601 date or datetime when visible on the receipt"),
  amt: z.number().nullable().describe("total amount"),
  cur: z.string().nullable().describe("currency"),
  pay: z.string().nullable().describe("payment method"),
  ref: z.string().nullable().describe("reference or transaction ID"),
  tax: z.number().nullable().describe("tax or fees"),
  items: z
    .array(
      z.object({
        d: z.string().describe("line item description"),
        a: z.number().nullable().describe("line item amount"),
      }),
    )
    .optional(),
  sum: z
    .string()
    .describe("one short sentence describing this item for later lookup"),
  ndesc: z
    .string()
    .nullable()
    .describe("if not a receipt, what the image shows"),
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
    isReceipt: extraction.rcpt,
    merchant: extraction.mrch,
    receiptDate: parseReceiptDate(extraction.date),
    totalAmount: extraction.amt,
    currency: extraction.cur,
    paymentMethod: extraction.pay,
    referenceId: extraction.ref,
    summary: extraction.rcpt
      ? extraction.sum
      : (extraction.ndesc ?? extraction.sum),
    details: {
      taxAmount: extraction.tax,
      lineItems: (extraction.items ?? []).map((item) => ({
        description: item.d,
        amount: item.a,
      })),
      notReceiptDescription: extraction.ndesc,
    },
  };
}

export async function extractReceiptFromImage(
  imageDataUrl: string,
): Promise<ReceiptExtraction> {
  const { object } = await generateObject({
    model: CHAT_MODEL,
    schema: zodSchema(receiptExtractionSchema),
    maxOutputTokens: 1024,
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
    if (isCsvBlobUrl(imageUrl)) {
      continue;
    }

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
