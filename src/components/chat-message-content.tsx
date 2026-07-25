"use client";

import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { AssistantMessageHtml } from "@/components/assistant-message-html";
import { ChatCsvDownload } from "@/components/chat-csv-download";
import {
  ChatSpendSummary,
  isSpendSummaryResult,
} from "@/components/chat-spend-summary";
import type {
  CsvDownloadToolError,
  CsvDownloadToolOutput,
} from "@/lib/chat-csv-export";
import {
  getReceiptImageProxyUrl,
  isCsvFilename,
  isLikelyReceiptBlobUrl,
} from "@/lib/receipt-image-url";

type ChatMessageContentProps = {
  message: UIMessage;
  isLoading?: boolean;
};

type FilePart = Extract<UIMessage["parts"][number], { type: "file" }>;

function isFilePart(part: UIMessage["parts"][number]): part is FilePart {
  return part.type === "file" && Boolean(part.url);
}

function filePartLooksLikeCsv(part: FilePart): boolean {
  if (
    part.mediaType === "text/csv" ||
    part.mediaType === "application/csv" ||
    part.mediaType === "application/vnd.ms-excel"
  ) {
    return true;
  }

  if (part.filename && isCsvFilename(part.filename)) {
    return true;
  }

  try {
    return isCsvFilename(new URL(part.url).pathname);
  } catch {
    return isCsvFilename(part.url);
  }
}

function isCsvFilePart(part: UIMessage["parts"][number]): boolean {
  return isFilePart(part) && filePartLooksLikeCsv(part);
}

function isRenderableImagePart(
  part: UIMessage["parts"][number],
): part is FilePart {
  if (!isFilePart(part) || filePartLooksLikeCsv(part)) {
    return false;
  }

  if (part.url.startsWith("blob:") || part.url.startsWith("data:")) {
    return Boolean(part.mediaType?.startsWith("image/"));
  }

  return isLikelyReceiptBlobUrl(part.url);
}

type ToolPart = {
  type: string;
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
  output?: unknown;
  errorText?: string;
};

function isNamedToolPart(
  part: UIMessage["parts"][number],
  name: string,
): part is UIMessage["parts"][number] & ToolPart & { type: `tool-${string}` } {
  return isToolUIPart(part) && getToolName(part) === name;
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

function ToolStatus({
  messageId,
  index,
  label,
}: {
  messageId: string;
  index: number;
  label: string;
}) {
  return (
    <p
      key={`${messageId}-tool-${index}`}
      className="text-sm text-zinc-600 dark:text-zinc-400"
    >
      {label}
    </p>
  );
}

export function ChatMessageContent({
  message,
  isLoading = false,
}: ChatMessageContentProps) {
  const hasRenderableContent = message.parts.some(
    (part) =>
      (part.type === "text" && part.text) ||
      isCsvFilePart(part) ||
      isRenderableImagePart(part) ||
      isNamedToolPart(part, "generateCsvDownload") ||
      isNamedToolPart(part, "summarizeSpend") ||
      isNamedToolPart(part, "searchSavedReceipts") ||
      isNamedToolPart(part, "confirmSavedReceipt") ||
      isNamedToolPart(part, "updateSavedReceipt") ||
      isNamedToolPart(part, "deleteSavedReceipt") ||
      isNamedToolPart(part, "setMerchantCategory"),
  );

  if (!hasRenderableContent) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {isLoading ? "Working on your request…" : "…"}
      </p>
    );
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

        if (isFilePart(part) && filePartLooksLikeCsv(part)) {
          return (
            <div
              key={`${message.id}-csv-file-${index}`}
              className={`inline-flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
                message.role === "user"
                  ? "border-white/25 bg-white/10 text-white"
                  : "border-border bg-surface text-foreground"
              }`}
            >
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide ${
                  message.role === "user"
                    ? "bg-white/20"
                    : "bg-brand-soft text-brand"
                }`}
              >
                CSV
              </span>
              <span className="truncate font-medium">
                {part.filename ?? "upload.csv"}
              </span>
            </div>
          );
        }

        if (isRenderableImagePart(part)) {
          const imageSrc =
            part.url.startsWith("blob:") || part.url.startsWith("data:")
              ? part.url
              : getReceiptImageProxyUrl(part.url);

          return (
            <img
              key={`${message.id}-file-${index}`}
              src={imageSrc}
              alt={part.filename ?? "Payment receipt"}
              className="max-h-64 w-full rounded-lg border border-zinc-200 object-contain dark:border-zinc-700"
            />
          );
        }

        if (isNamedToolPart(part, "summarizeSpend")) {
          const toolPart = part as UIMessage["parts"][number] & ToolPart;

          if (
            toolPart.state === "input-streaming" ||
            toolPart.state === "input-available"
          ) {
            return (
              <ToolStatus
                key={`${message.id}-spend-${index}`}
                messageId={message.id}
                index={index}
                label="Summarizing spend…"
              />
            );
          }

          if (toolPart.state === "output-error") {
            return (
              <p
                key={`${message.id}-spend-${index}`}
                className="text-sm text-red-700 dark:text-red-300"
              >
                {toolPart.errorText ?? "Could not summarize spend."}
              </p>
            );
          }

          if (
            toolPart.state === "output-available" &&
            isSpendSummaryResult(toolPart.output)
          ) {
            return (
              <ChatSpendSummary
                key={`${message.id}-spend-${index}`}
                summary={toolPart.output}
              />
            );
          }

          return null;
        }

        if (isNamedToolPart(part, "searchSavedReceipts")) {
          const toolPart = part as UIMessage["parts"][number] & ToolPart;

          if (
            toolPart.state === "input-streaming" ||
            toolPart.state === "input-available"
          ) {
            return (
              <ToolStatus
                key={`${message.id}-search-${index}`}
                messageId={message.id}
                index={index}
                label="Searching saved receipts…"
              />
            );
          }

          if (
            toolPart.state === "output-available" &&
            typeof toolPart.output === "object" &&
            toolPart.output !== null &&
            "totalCount" in toolPart.output
          ) {
            const output = toolPart.output as {
              totalCount: number;
              returnedCount: number;
              truncated?: boolean;
            };
            return (
              <p
                key={`${message.id}-search-${index}`}
                className="text-xs text-zinc-500 dark:text-zinc-400"
              >
                Found {output.totalCount} saved receipt
                {output.totalCount === 1 ? "" : "s"}
                {output.truncated
                  ? ` (showing ${output.returnedCount})`
                  : ""}
                .
              </p>
            );
          }

          return null;
        }

        const memoryToolLabel = isNamedToolPart(part, "confirmSavedReceipt")
          ? "Confirming receipt…"
          : isNamedToolPart(part, "updateSavedReceipt")
            ? "Updating receipt…"
            : isNamedToolPart(part, "deleteSavedReceipt")
              ? "Deleting receipt…"
              : isNamedToolPart(part, "setMerchantCategory")
                ? "Saving category…"
                : null;

        if (memoryToolLabel) {
          const toolPart = part as UIMessage["parts"][number] & ToolPart;

          if (
            toolPart.state === "input-streaming" ||
            toolPart.state === "input-available"
          ) {
            return (
              <ToolStatus
                key={`${message.id}-mem-${index}`}
                messageId={message.id}
                index={index}
                label={memoryToolLabel}
              />
            );
          }

          return null;
        }

        if (isNamedToolPart(part, "generateCsvDownload")) {
          const toolPart = part as UIMessage["parts"][number] & ToolPart;

          if (
            toolPart.state === "input-streaming" ||
            toolPart.state === "input-available"
          ) {
            return (
              <ToolStatus
                key={`${message.id}-csv-${index}`}
                messageId={message.id}
                index={index}
                label="Preparing CSV download…"
              />
            );
          }

          if (toolPart.state === "output-error") {
            return (
              <p
                key={`${message.id}-csv-${index}`}
                className="text-sm text-red-700 dark:text-red-300"
              >
                {toolPart.errorText ?? "Could not create the CSV file."}
              </p>
            );
          }

          if (
            toolPart.state === "output-available" &&
            isCsvDownloadOutput(toolPart.output)
          ) {
            return (
              <ChatCsvDownload
                key={`${message.id}-csv-${index}`}
                output={toolPart.output}
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
