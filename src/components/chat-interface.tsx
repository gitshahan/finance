"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart } from "ai";
import type { UIMessage } from "ai";
import { ChatMessageContent } from "@/components/chat-message-content";
import { ReceiptImageButton } from "@/components/receipt-image-button";
import { getReceiptUploadSizeLimitError, isCsvFile } from "@/lib/receipt-image-url";
import { uploadReceiptImage } from "@/lib/receipt-upload";
import type { UserTokenUsage } from "@/lib/token-usage-store";

type ChatInterfaceProps = {
  initialMessages: UIMessage[];
  chatPersistenceEnabled?: boolean;
  tokenUsage: UserTokenUsage | null;
  onTokenUsageChange: (usage: UserTokenUsage) => void;
};

const DEFAULT_RECEIPT_IMAGE_PROMPT =
  "Please analyze this payment receipt and summarize the key details.";

const DEFAULT_RECEIPT_CSV_PROMPT =
  "Please analyze this CSV file of receipt data and summarize the key details.";

const SCROLL_BOTTOM_THRESHOLD_PX = 80;

function shouldDeferRefocus(relatedTarget: EventTarget | null) {
  if (!relatedTarget || !(relatedTarget instanceof HTMLElement)) {
    return false;
  }

  const tag = relatedTarget.tagName;
  return (
    tag === "BUTTON" ||
    tag === "A" ||
    tag === "INPUT" ||
    tag === "SELECT" ||
    tag === "TEXTAREA" ||
    relatedTarget.isContentEditable
  );
}

export function ChatInterface({
  initialMessages,
  chatPersistenceEnabled = true,
  tokenUsage,
  onTokenUsageChange,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedReceipt, setUploadedReceipt] = useState<FileUIPart | null>(
    null,
  );
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | undefined>(
    undefined,
  );
  const attachmentIsCsv = attachedFile ? isCsvFile(attachedFile) : false;
  const attachmentPreviewUrl = useMemo(() => {
    if (!attachedFile || isCsvFile(attachedFile)) {
      return null;
    }

    return URL.createObjectURL(attachedFile);
  }, [attachedFile]);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);
  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });
  const prevStatusRef = useRef(status);

  const isSending = status === "submitted" || status === "streaming";
  const hasAttachment = Boolean(attachedFile);
  const isAttachmentReady = !hasAttachment || Boolean(uploadedReceipt);
  const canSend =
    Boolean(input.trim() || hasAttachment) &&
    isAttachmentReady &&
    !isUploadingReceipt;

  function focusInput() {
    inputRef.current?.focus();
  }

  function isNearBottom(container: HTMLElement) {
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      SCROLL_BOTTOM_THRESHOLD_PX
    );
  }

  function updateScrollToBottomVisibility() {
    const container = messagesContainerRef.current;

    if (!container || messages.length === 0) {
      setShowScrollToBottom(false);
      return;
    }

    setShowScrollToBottom(
      container.scrollHeight > container.clientHeight && !isNearBottom(container),
    );
  }

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    const container = messagesContainerRef.current;

    if (container && behavior === "auto") {
      container.scrollTop = container.scrollHeight;
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior });
  }

  function clearAttachment() {
    setAttachedFile(null);
    setUploadedReceipt(null);
    setUploadProgress(undefined);
    setUploadError(null);
  }

  async function handleReceiptSelect(file: File) {
    const sizeLimitError = getReceiptUploadSizeLimitError(file);
    if (sizeLimitError) {
      setAttachedFile(null);
      setUploadedReceipt(null);
      setUploadError(sizeLimitError);
      setIsUploadingReceipt(false);
      setUploadProgress(undefined);
      return;
    }

    setAttachedFile(file);
    setUploadedReceipt(null);
    setUploadError(null);
    setIsUploadingReceipt(true);
    setUploadProgress(0);

    try {
      const uploaded = await uploadReceiptImage(file, setUploadProgress);
      setUploadedReceipt(uploaded);
    } catch (error) {
      console.error("Receipt upload failed:", error);
      setAttachedFile(null);
      setUploadError(
        error instanceof Error
          ? error.message
          : "Unable to upload the receipt file right now. Please try again.",
      );
    } finally {
      setIsUploadingReceipt(false);
      setUploadProgress(undefined);
    }
  }

  async function sendCurrentMessage() {
    if (!canSend || isSending) {
      return;
    }

    setUploadError(null);
    const text =
      input.trim() ||
      (hasAttachment
        ? attachmentIsCsv
          ? DEFAULT_RECEIPT_CSV_PROMPT
          : DEFAULT_RECEIPT_IMAGE_PROMPT
        : "");
    const files = uploadedReceipt ? [uploadedReceipt] : undefined;

    try {
      await sendMessage({
        text,
        files,
      });
    } catch (error) {
      const maybeResponseError = error as {
        response?: {
          status?: number;
          json?: () => Promise<{ usage?: UserTokenUsage }>;
        };
      };

      if (
        maybeResponseError.response?.status === 429 &&
        maybeResponseError.response.json
      ) {
        try {
          const data = await maybeResponseError.response.json();
          if (data.usage) {
            onTokenUsageChange(data.usage);
          }
        } catch (jsonError) {
          console.error("Failed to parse quota response:", jsonError);
        }
      }

      throw error;
    }

    setInput("");
    clearAttachment();
    requestAnimationFrame(() => focusInput());
  }

  useEffect(() => {
    const wasBusy =
      prevStatusRef.current === "submitted" ||
      prevStatusRef.current === "streaming";
    const isReady = status === "ready";

    if (wasBusy && isReady) {
      void fetch("/api/token-usage")
        .then((response) => {
          if (!response.ok) {
            return null;
          }

          return response.json() as Promise<{ usage?: UserTokenUsage }>;
        })
        .then((data) => {
          if (data?.usage) {
            onTokenUsageChange(data.usage);
          }
        })
        .catch((fetchError) => {
          console.error("Failed to refresh token usage:", fetchError);
        });
    }

    prevStatusRef.current = status;
  }, [status, onTokenUsageChange]);

  useEffect(() => {
    focusInput();
  }, []);

  useEffect(() => {
    if (!isSending) {
      focusInput();
    }
  }, [isSending]);

  useEffect(() => {
    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    if (!didInitialScrollRef.current && messages.length > 0) {
      didInitialScrollRef.current = true;
      scrollToBottom("auto");
      requestAnimationFrame(() => {
        scrollToBottom("auto");
        updateScrollToBottomVisibility();
      });
      return;
    }

    if (isNearBottom(container) || messages.length <= 1) {
      scrollToBottom(isSending ? "auto" : "smooth");
    }

    updateScrollToBottomVisibility();
  }, [messages, isSending]);

  useEffect(() => {
    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    const handleScroll = () => updateScrollToBottomVisibility();
    container.addEventListener("scroll", handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      updateScrollToBottomVisibility();
    });
    resizeObserver.observe(container);

    updateScrollToBottomVisibility();

    return () => {
      container.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, [messages.length]);

  useEffect(() => {
    return () => {
      if (attachmentPreviewUrl) {
        URL.revokeObjectURL(attachmentPreviewUrl);
      }
    };
  }, [attachmentPreviewUrl]);

  function handleInputBlur(event: React.FocusEvent<HTMLTextAreaElement>) {
    const next = event.relatedTarget;
    const form = event.currentTarget.form;

    if (next && form?.contains(next as Node)) {
      return;
    }

    if (shouldDeferRefocus(next)) {
      return;
    }

    requestAnimationFrame(() => focusInput());
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="relative min-h-0 flex-1">
        <div
          ref={messagesContainerRef}
          className="h-full space-y-4 overflow-y-auto p-6"
        >
        {!chatPersistenceEnabled ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            Chat history is not being saved because DATABASE_URL is not
            configured. Messages will still work for this session.
          </div>
        ) : null}

        {tokenUsage?.isQuotaExceeded ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
            <p className="font-medium">
              Usage limit reached for this account. Please contact support to
              extend your quota.
            </p>
          </div>
        ) : null}

        {uploadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
            {uploadError}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
            {error.message ||
              "Could not get a reply. Please check your configuration and try again."}
          </div>
        ) : null}

        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Attach a payment receipt image or CSV to analyze it. You can ask about
            receipts in this chat or ones you shared earlier.
          </div>
        ) : null}

        {messages.map((message, messageIndex) => {
          const isLastMessage = messageIndex === messages.length - 1;
          const isAssistantLoading =
            isSending &&
            isLastMessage &&
            message.role === "assistant";

          return (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  message.role === "user"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                }`}
              >
                <ChatMessageContent
                  message={message}
                  isLoading={isAssistantLoading}
                />
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
        </div>

        {showScrollToBottom ? (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            aria-label="Scroll to bottom"
            className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-lg transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        ) : null}
      </div>

      <form
        className="shrink-0 border-t border-zinc-200 p-4 dark:border-zinc-800"
        onSubmit={(event) => {
          event.preventDefault();
          void sendCurrentMessage();
        }}
      >
        {hasAttachment ? (
          <div className="mb-3 flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
            {attachmentPreviewUrl ? (
              <img
                src={attachmentPreviewUrl}
                alt="Receipt preview"
                className="h-20 w-20 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
              />
            ) : (
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-xs font-semibold uppercase text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                aria-hidden="true"
              >
                CSV
              </div>
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {attachmentIsCsv ? "CSV file attached" : "Payment receipt attached"}
              </p>
              <p className="text-zinc-500 dark:text-zinc-400">
                {isUploadingReceipt
                  ? uploadProgress !== undefined
                    ? `Uploading… ${uploadProgress}%`
                    : "Uploading…"
                  : (attachedFile?.name ??
                    (attachmentIsCsv ? "CSV ready to send" : "Image ready to send"))}
              </p>
            </div>
            <button
              type="button"
              onClick={clearAttachment}
              disabled={isSending || isUploadingReceipt}
              className="rounded-lg px-2 py-1 text-sm text-zinc-600 transition hover:bg-zinc-200 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Remove
            </button>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <ReceiptImageButton
            disabled={isSending}
            uploading={isUploadingReceipt}
            progress={uploadProgress}
            onSelect={(file) => void handleReceiptSelect(file)}
          />
          <div className="min-w-0 flex-1">
            <textarea
              ref={inputRef}
              autoFocus
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onBlur={handleInputBlur}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendCurrentMessage();
                }
              }}
              placeholder="Ask about a receipt you shared..."
              className="h-12 w-full resize-none overflow-hidden rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-zinc-400 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
              disabled={isSending}
            />
          </div>
          <button
            type="submit"
            disabled={isSending || !canSend || Boolean(tokenUsage?.isQuotaExceeded)}
            className="h-12 cursor-pointer rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
