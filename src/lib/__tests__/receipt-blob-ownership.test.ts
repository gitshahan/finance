import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  messagesOnlyUseOwnedReceiptBlobs,
  userOwnsReceiptBlobUrl,
} from "@/lib/receipt-blob";

describe("receipt blob ownership", () => {
  const userId = "user_123";

  it("accepts owned receipt blob paths", () => {
    expect(
      userOwnsReceiptBlobUrl(
        "https://blob.vercel-storage.com/receipts/user_123/abc.jpg",
        userId,
      ),
    ).toBe(true);
  });

  it("rejects another user's blob path", () => {
    expect(
      userOwnsReceiptBlobUrl(
        "https://blob.vercel-storage.com/receipts/user_other/abc.jpg",
        userId,
      ),
    ).toBe(false);
  });

  it("rejects chat payloads that reference foreign blobs", () => {
    const messages = [
      {
        id: "m1",
        role: "user",
        parts: [
          {
            type: "file",
            url: "https://blob.vercel-storage.com/receipts/user_other/abc.jpg",
            mediaType: "image/jpeg",
          },
        ],
      },
    ] as UIMessage[];

    expect(messagesOnlyUseOwnedReceiptBlobs(userId, messages)).toBe(false);
  });
});
