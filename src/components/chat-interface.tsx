"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart } from "ai";
import type { UIMessage } from "ai";
import { ChatMessageContent } from "@/components/chat-message-content";
import {
  ReceiptImageButton,
  type ReceiptImageButtonHandle,
} from "@/components/receipt-image-button";
import { getReceiptUploadSizeLimitError } from "@/lib/receipt-image-url";
import { uploadReceiptImage } from "@/lib/receipt-upload";
import type { UserTokenUsage } from "@/lib/token-usage-store";

type ChatInterfaceProps = {
  chatId?: string;
  initialMessages: UIMessage[];
  chatPersistenceEnabled?: boolean;
  usageTrackingEnabled?: boolean;
  tokenUsage: UserTokenUsage | null;
  onTokenUsageChange: (usage: UserTokenUsage) => void;
  onHasMessagesChange?: (hasMessages: boolean) => void;
};

const DEFAULT_RECEIPT_CSV_PROMPT =
  "Summarize this CSV: columns, date range, merchants, and totals. Reply from the file contents only — no export.";

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
  chatId = "default",
  initialMessages,
  chatPersistenceEnabled = true,
  usageTrackingEnabled = true,
  tokenUsage,
  onTokenUsageChange,
  onHasMessagesChange,
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
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachButtonRef = useRef<ReceiptImageButtonHandle>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const { messages, sendMessage, status, error } = useChat({
    id: chatId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { chatId },
    }),
  });
  const prevStatusRef = useRef(status);

  const isSending = status === "submitted" || status === "streaming";
  const isEmptyChat = messages.length === 0;
  const hasAttachment = Boolean(attachedFile);
  const isAttachmentReady = !hasAttachment || Boolean(uploadedReceipt);
  // New chats must start with a shared CSV file.
  const canSend =
    usageTrackingEnabled &&
    !isUploadingReceipt &&
    isAttachmentReady &&
    (isEmptyChat
      ? Boolean(uploadedReceipt)
      : Boolean(input.trim() || hasAttachment));

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
    if (!container) {
      return;
    }

    // Scroll the messages pane directly — scrollIntoView can target the wrong ancestor.
    if (behavior === "smooth") {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      return;
    }

    container.scrollTop = container.scrollHeight;
  }

  function pinToBottom() {
    stickToBottomRef.current = true;
    scrollToBottom("auto");
    requestAnimationFrame(() => {
      scrollToBottom("auto");
      updateScrollToBottomVisibility();
    });
  }

  function clearAttachment() {
    setAttachedFile(null);
    setUploadedReceipt(null);
    setUploadProgress(undefined);
    setUploadError(null);
  }

  async function sendMessageWithFile(
    filePart: FileUIPart,
    options?: { note?: string },
  ) {
    if (!usageTrackingEnabled || isSending) {
      return;
    }

    setUploadError(null);
    const text = options?.note?.trim() || DEFAULT_RECEIPT_CSV_PROMPT;
    // Clear the composer attachment as soon as send starts so the UI doesn't
    // look stuck on "CSV attached" while the model/tools run.
    setInput("");
    clearAttachment();
    pinToBottom();

    try {
      await sendMessage({
        text,
        files: [filePart],
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

    requestAnimationFrame(() => focusInput());
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

    const startEmptyChat = messages.length === 0;
    const note = input.trim();

    setAttachedFile(file);
    setUploadedReceipt(null);
    setUploadError(null);
    setIsUploadingReceipt(true);
    setUploadProgress(0);

    try {
      const uploaded = await uploadReceiptImage(file, setUploadProgress);
      setUploadedReceipt(uploaded);

      // Empty chats start as soon as a CSV is shared.
      if (startEmptyChat) {
        setIsUploadingReceipt(false);
        setUploadProgress(undefined);
        await sendMessageWithFile(uploaded, { note });
        return;
      }
    } catch (error) {
      console.error("CSV upload failed:", error);
      setAttachedFile(null);
      setUploadedReceipt(null);
      setUploadError(
        error instanceof Error
          ? error.message
          : "Unable to upload the CSV file right now. Please try again.",
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

    if (isEmptyChat) {
      if (!uploadedReceipt) {
        return;
      }

      await sendMessageWithFile(uploadedReceipt, {
        note: input,
      });
      return;
    }

    setUploadError(null);
    const text =
      input.trim() || (hasAttachment ? DEFAULT_RECEIPT_CSV_PROMPT : "");
    const files = uploadedReceipt ? [uploadedReceipt] : undefined;
    setInput("");
    clearAttachment();
    pinToBottom();

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

    requestAnimationFrame(() => focusInput());
  }

  function handleComposerDragOver(event: React.DragEvent<HTMLElement>) {
    if (!usageTrackingEnabled || isSending || isUploadingReceipt) {
      return;
    }

    if (![...event.dataTransfer.types].includes("Files")) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsFileDragOver(true);
  }

  function handleComposerDragLeave(event: React.DragEvent<HTMLElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) {
      return;
    }

    setIsFileDragOver(false);
  }

  function handleComposerDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsFileDragOver(false);

    if (!usageTrackingEnabled || isSending || isUploadingReceipt) {
      return;
    }

    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleReceiptSelect(file);
    }
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
    onHasMessagesChange?.(!isEmptyChat);
  }, [isEmptyChat, onHasMessagesChange]);

  useEffect(() => {
    if (!isEmptyChat) {
      focusInput();
    }
  }, [isEmptyChat]);

  useEffect(() => {
    if (!isSending && !isEmptyChat) {
      focusInput();
    }
  }, [isSending, isEmptyChat]);

  useEffect(() => {
    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    if (!didInitialScrollRef.current && messages.length > 0) {
      didInitialScrollRef.current = true;
      pinToBottom();
      return;
    }

    // Follow new content while stuck to bottom (pinned when the user sends).
    if (stickToBottomRef.current) {
      scrollToBottom(isSending ? "auto" : "smooth");
    }

    updateScrollToBottomVisibility();
  }, [messages, isSending]);

  useEffect(() => {
    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    const handleScroll = () => {
      stickToBottomRef.current = isNearBottom(container);
      updateScrollToBottomVisibility();
    };
    container.addEventListener("scroll", handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      if (stickToBottomRef.current) {
        scrollToBottom("auto");
      }
      updateScrollToBottomVisibility();
    });
    resizeObserver.observe(container);

    updateScrollToBottomVisibility();

    return () => {
      container.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, [messages.length]);

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

  if (isEmptyChat) {
    return (
      <section className="relative flex min-h-0 flex-1 flex-col">
        {/* Hidden picker — opened by the centered upload CTA */}
        <div className="sr-only">
          <ReceiptImageButton
            ref={attachButtonRef}
            variant="inline"
            disabled={
              !usageTrackingEnabled ||
              isSending ||
              isUploadingReceipt ||
              Boolean(tokenUsage?.isQuotaExceeded)
            }
            uploading={isUploadingReceipt}
            progress={uploadProgress}
            onSelect={(file) => void handleReceiptSelect(file)}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-6">
          {!usageTrackingEnabled ? (
            <div className="w-full max-w-lg rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
              Chat is disabled because DATABASE_URL is not configured. Usage
              quotas must be enforceable before the assistant can run.
            </div>
          ) : !chatPersistenceEnabled ? (
            <div className="w-full max-w-lg rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
              Chat history could not be loaded. New messages may not persist.
            </div>
          ) : null}

          {tokenUsage?.isQuotaExceeded ? (
            <div className="w-full max-w-lg rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
              <p className="font-medium">
                Usage limit reached for this account. Please contact support to
                extend your quota.
              </p>
            </div>
          ) : null}

          {uploadError ? (
            <div className="w-full max-w-lg rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
              {uploadError}
            </div>
          ) : null}

          <button
            type="button"
            disabled={
              !usageTrackingEnabled ||
              isSending ||
              isUploadingReceipt ||
              Boolean(tokenUsage?.isQuotaExceeded)
            }
            onClick={() => attachButtonRef.current?.open()}
            onDragOver={handleComposerDragOver}
            onDragLeave={handleComposerDragLeave}
            onDrop={handleComposerDrop}
            className={`flex w-full max-w-lg cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-8 py-14 text-center transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isFileDragOver
                ? "border-brand-accent bg-brand-soft"
                : "border-border/80 bg-transparent hover:border-brand-ring hover:bg-brand-soft/50"
            }`}
          >
            <img
              src="/vite.svg"
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 rounded-xl bg-white object-contain p-1 shadow-sm"
            />
            <span className="font-display text-lg font-semibold tracking-display text-foreground">
              Upload a CSV to start
            </span>
            <span className="max-w-md text-sm leading-relaxed text-muted">
              Drop your bank or card CSV here (under 1MB). The chat begins once
              the file is uploaded.
            </span>
            {isUploadingReceipt && uploadProgress !== undefined ? (
              <div className="w-full max-w-xs space-y-2">
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-brand-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={uploadProgress}
                  aria-label={`Upload progress ${uploadProgress} percent`}
                >
                  <div
                    className="h-full rounded-full bg-brand-accent transition-[width] duration-150 ease-out"
                    style={{ width: `${Math.max(uploadProgress, 4)}%` }}
                  />
                </div>
                <span className="block text-sm font-medium text-brand">
                  Uploading… {uploadProgress}%
                </span>
              </div>
            ) : (
              <span className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold tracking-tight text-white transition hover:bg-brand-strong">
                {isUploadingReceipt ? "Uploading…" : "Choose CSV"}
              </span>
            )}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
      <div className="relative min-h-0 flex-1">
        <div
          ref={messagesContainerRef}
          className="h-full overflow-y-auto px-4 py-6 sm:px-6"
        >
          <div className="w-full space-y-4">
            {!usageTrackingEnabled ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                Chat is disabled because DATABASE_URL is not configured. Usage
                quotas must be enforceable before the assistant can run.
              </div>
            ) : !chatPersistenceEnabled ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                Chat history could not be loaded. New messages may not persist.
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

            {messages.map((message, messageIndex) => {
              const isLastMessage = messageIndex === messages.length - 1;
              const isAssistantLoading =
                isSending && isLastMessage && message.role === "assistant";
              const isUser = message.role === "user";

              return (
                <div
                  key={message.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`rounded-2xl px-4 py-3 text-[0.9375rem] leading-relaxed tracking-tight ${
                      isUser
                        ? "max-w-[min(100%,42rem)] bg-brand font-medium text-white"
                        : "w-full max-w-none bg-surface-muted text-foreground"
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
            {isSending && messages.at(-1)?.role === "user" ? (
              <div className="flex justify-start">
                <div className="w-full rounded-2xl bg-surface-muted px-4 py-3 text-[0.9375rem] leading-relaxed tracking-tight text-muted">
                  Working on your request…
                </div>
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>
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
        className={`shrink-0 border-t px-4 py-4 transition sm:px-6 ${
          isFileDragOver
            ? "border-brand-accent bg-brand-soft/60"
            : "border-border"
        }`}
        onDragOver={handleComposerDragOver}
        onDragLeave={handleComposerDragLeave}
        onDrop={handleComposerDrop}
        onSubmit={(event) => {
          event.preventDefault();
          void sendCurrentMessage();
        }}
      >
        <div className="w-full">
        {hasAttachment ? (
          <div
            className={`mb-3 flex items-start gap-3 rounded-xl border p-3 ${
              isUploadingReceipt
                ? "border-brand-accent bg-brand-soft/70"
                : "border-border bg-surface-muted"
            }`}
            aria-busy={isUploadingReceipt}
          >
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border">
              <div
                className={`flex h-full w-full items-center justify-center bg-surface text-xs font-semibold uppercase text-brand ${
                  isUploadingReceipt ? "opacity-60" : ""
                }`}
                aria-hidden="true"
              >
                CSV
              </div>
              {isUploadingReceipt ? (
                <div
                  className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-surface/40"
                  aria-hidden="true"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-6 w-6 animate-spin text-brand"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                </div>
              ) : null}
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold tracking-tight text-foreground">
                {isUploadingReceipt ? "Uploading CSV…" : "CSV attached"}
              </p>
              <p className="truncate text-muted">
                {isUploadingReceipt
                  ? uploadProgress !== undefined
                    ? `${uploadProgress}% · ${attachedFile?.name ?? "Preparing…"}`
                    : (attachedFile?.name ?? "Preparing…")
                  : (attachedFile?.name ?? "CSV ready to send")}
              </p>
              {isUploadingReceipt ? (
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={uploadProgress}
                  aria-label={
                    uploadProgress !== undefined
                      ? `Upload progress ${uploadProgress} percent`
                      : "Upload in progress"
                  }
                >
                  <div
                    className={`h-full rounded-full bg-brand-accent transition-[width] duration-150 ease-out ${
                      uploadProgress === undefined
                        ? "w-1/3 animate-pulse"
                        : ""
                    }`}
                    style={
                      uploadProgress !== undefined
                        ? { width: `${Math.max(uploadProgress, 4)}%` }
                        : undefined
                    }
                  />
                </div>
              ) : null}
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

        <div className="flex h-12 min-w-0 items-center gap-1 rounded-xl border border-border bg-surface px-1.5 transition focus-within:ring-2 focus-within:ring-brand-ring">
          <ReceiptImageButton
            ref={attachButtonRef}
            variant="inline"
            disabled={isSending || !usageTrackingEnabled}
            uploading={isUploadingReceipt}
            progress={uploadProgress}
            onSelect={(file) => void handleReceiptSelect(file)}
          />
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
            placeholder="Ask about your CSV or saved receipts..."
            className="h-full min-w-0 flex-1 resize-none overflow-hidden bg-transparent px-1.5 py-2.5 text-[0.9375rem] tracking-tight outline-none placeholder:text-muted"
            disabled={isSending || !usageTrackingEnabled}
          />
          <button
            type="submit"
            disabled={
              isSending ||
              !canSend ||
              !usageTrackingEnabled ||
              Boolean(tokenUsage?.isQuotaExceeded)
            }
            aria-label={isSending ? "Sending" : "Send message"}
            title={isSending ? "Sending…" : "Send"}
            className="mr-0.5 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
            )}
          </button>
        </div>
        </div>
      </form>
    </section>
  );
}
