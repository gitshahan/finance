import { describe, expect, it } from "vitest";
import { isValidChatId, mergeMessagesPreservingServerHistory } from "@/lib/chat-store";
import type { UIMessage } from "ai";

describe("chat store helpers", () => {
  it("validates chat ids", () => {
    expect(isValidChatId("default")).toBe(true);
    expect(isValidChatId("chat_abc123")).toBe(true);
    expect(isValidChatId("../evil")).toBe(false);
    expect(isValidChatId("a".repeat(65))).toBe(false);
  });

  it("preserves server file parts when the client omits them", () => {
    const server = [
      {
        id: "m1",
        role: "user",
        parts: [
          { type: "text", text: "hi" },
          {
            type: "file",
            url: "https://blob.vercel-storage.com/receipts/u1/a.jpg",
            mediaType: "image/jpeg",
          },
        ],
      },
    ] as UIMessage[];

    const client = [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    ] as UIMessage[];

    const merged = mergeMessagesPreservingServerHistory(server, client);
    expect(merged[0]?.parts).toHaveLength(2);
    expect(merged[0]?.parts.some((part) => part.type === "file")).toBe(true);
  });
});
