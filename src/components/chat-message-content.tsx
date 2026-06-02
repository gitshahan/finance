"use client";

import type { UIMessage } from "ai";
import { AssistantMessageHtml } from "@/components/assistant-message-html";
import {
  getReceiptImageProxyUrl,
  isLikelyReceiptBlobUrl,
} from "@/lib/receipt-image-url";

type ChatMessageContentProps = {
  message: UIMessage;
};

function isRenderableImagePart(
  part: UIMessage["parts"][number],
): part is Extract<UIMessage["parts"][number], { type: "file" }> {
  return (
    part.type === "file" &&
    Boolean(part.url) &&
    (part.mediaType?.startsWith("image/") || isLikelyReceiptBlobUrl(part.url))
  );
}

export function ChatMessageContent({ message }: ChatMessageContentProps) {
  const hasRenderableContent = message.parts.some(
    (part) => part.type === "text" || isRenderableImagePart(part),
  );

  if (!hasRenderableContent) {
    return <>…</>;
  }

  return (
    <div className="space-y-2">
      {message.parts.map((part, index) => {
        if (part.type === "text" && part.text) {
          if (message.role === "assistant") {
            return (
              <AssistantMessageHtml
                key={`${message.id}-text-${index}`}
                html={part.text}
              />
            );
          }

          return (
            <p
              key={`${message.id}-text-${index}`}
              className="whitespace-pre-wrap"
            >
              {part.text}
            </p>
          );
        }

        if (isRenderableImagePart(part)) {
          const imageSrc = isLikelyReceiptBlobUrl(part.url)
            ? getReceiptImageProxyUrl(part.url)
            : part.url;

          return (
            <img
              key={`${message.id}-file-${index}`}
              src={imageSrc}
              alt={part.filename ?? "Payment receipt"}
              className="max-h-64 w-full rounded-lg border border-zinc-200 object-contain dark:border-zinc-700"
            />
          );
        }

        return null;
      })}
    </div>
  );
}
