"use client";

import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { AssistantMessageHtml } from "@/components/assistant-message-html";
import { ChatCsvDownload } from "@/components/chat-csv-download";
import type {
  CsvDownloadToolError,
  CsvDownloadToolOutput,
} from "@/lib/chat-csv-export";
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

type GenerateCsvDownloadToolPart = {
  type: string;
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
  output?: unknown;
  errorText?: string;
};

function isGenerateCsvDownloadPart(
  part: UIMessage["parts"][number],
): part is UIMessage["parts"][number] & GenerateCsvDownloadToolPart {
  return isToolUIPart(part) && getToolName(part) === "generateCsvDownload";
}

function isCsvDownloadOutput(
  output: unknown,
): output is CsvDownloadToolOutput | CsvDownloadToolError {
  return (
    typeof output === "object" &&
    output !== null &&
    ("csv" in output || "error" in output)
  );
}

export function ChatMessageContent({ message }: ChatMessageContentProps) {
  const hasRenderableContent = message.parts.some(
    (part) =>
      part.type === "text" ||
      isRenderableImagePart(part) ||
      isGenerateCsvDownloadPart(part),
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

        if (isGenerateCsvDownloadPart(part)) {
          if (part.state === "input-available") {
            return (
              <p
                key={`${message.id}-csv-${index}`}
                className="text-sm text-zinc-600 dark:text-zinc-400"
              >
                Preparing CSV download…
              </p>
            );
          }

          if (part.state === "output-error") {
            return (
              <p
                key={`${message.id}-csv-${index}`}
                className="text-sm text-red-700 dark:text-red-300"
              >
                {part.errorText ?? "Could not create the CSV file."}
              </p>
            );
          }

          if (
            part.state === "output-available" &&
            isCsvDownloadOutput(part.output)
          ) {
            return (
              <ChatCsvDownload
                key={`${message.id}-csv-${index}`}
                output={part.output}
              />
            );
          }

          return null;
        }

        return null;
      })}
    </div>
  );
}
