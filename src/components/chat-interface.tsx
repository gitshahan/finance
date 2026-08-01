"use client";

import { useUser } from "@clerk/nextjs";
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

// Treat as "at bottom" within this distance (covers floating ask bar padding).
const SCROLL_BOTTOM_THRESHOLD_PX = 80;

const FALLBACK_CHAT_ERROR =
  "Could not get a reply. Please check your OpenAI API key and try again.";

/** DefaultChatTransport puts the response body into Error.message — unwrap JSON `{ error }`. */
function formatChatErrorMessage(error: Error | undefined): string | null {
  if (!error) {
    return null;
  }

  const raw = error.message?.trim();
  if (!raw) {
    return FALLBACK_CHAT_ERROR;
  }

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { error?: unknown };
      if (typeof parsed.error === "string" && parsed.error.trim()) {
        return parsed.error.trim();
      }
    } catch {
      // keep the raw body
    }
  }

  return raw;
}

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
  const { user } = useUser();
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
  const { messages, sendMessage, status, error, clearError } = useChat({
    id: chatId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { chatId },
    }),
  });
  const prevStatusRef = useRef(status);

  const chatErrorMessage = formatChatErrorMessage(error);

  const isSending = status === "submitted" || status === "streaming";
  const isEmptyChat = messages.length === 0;
  const hasAttachment = Boolean(attachedFile);
  const isAttachmentReady = !hasAttachment || Boolean(uploadedReceipt);
  const userImageUrl = user?.imageUrl;
  const userInitials =
    user?.firstName?.charAt(0) ||
    user?.username?.charAt(0) ||
    user?.primaryEmailAddress?.emailAddress?.charAt(0) ||
    "U";
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

  function isLastMessageInView(container: HTMLElement) {
    if (isNearBottom(container)) {
      return true;
    }

    const end = messagesEndRef.current;
    if (!end) {
      return false;
    }

    const containerRect = container.getBoundingClientRect();
    const endRect = end.getBoundingClientRect();
    // Any intersection with the scrollport counts, including under the ask bar.
    return endRect.top < containerRect.bottom && endRect.bottom > containerRect.top;
  }

  function updateScrollToBottomVisibility() {
    const container = messagesContainerRef.current;

    if (!container || messages.length === 0) {
      setShowScrollToBottom(false);
      return;
    }

    const canScroll = container.scrollHeight > container.clientHeight + 1;
    setShowScrollToBottom(canScroll && !isLastMessageInView(container));
  }

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    stickToBottomRef.current = true;
    setShowScrollToBottom(false);

    // Scroll the messages pane directly — scrollIntoView can target the wrong ancestor.
    if (behavior === "smooth") {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      return;
    }

    container.scrollTop = container.scrollHeight;
  }

  // Overlay controls sit above the messages pane and would otherwise swallow wheel scroll.
  function forwardWheelToMessages(event: React.WheelEvent) {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTop += event.deltaY;
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
    const settled = status === "ready" || status === "error";

    if (wasBusy && settled) {
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
    if (chatErrorMessage) {
      pinToBottom();
    }
  }, [chatErrorMessage]);

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
      // Avoid re-showing the button before smooth scroll finishes.
      setShowScrollToBottom(false);
      return;
    }

    updateScrollToBottomVisibility();
  }, [messages, isSending]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    const end = messagesEndRef.current;

    if (!container) {
      return;
    }

    const syncBottomState = () => {
      const atBottom = isLastMessageInView(container);
      stickToBottomRef.current = atBottom;
      updateScrollToBottomVisibility();
    };

    const handleScroll = () => {
      syncBottomState();
    };
    container.addEventListener("scroll", handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      if (stickToBottomRef.current) {
        scrollToBottom("auto");
      }
      syncBottomState();
    });
    resizeObserver.observe(container);

    // Keep visibility in sync as the last message grows during streaming.
    let intersectionObserver: IntersectionObserver | undefined;
    if (end && messages.length > 0) {
      intersectionObserver = new IntersectionObserver(
        () => {
          syncBottomState();
        },
        {
          root: container,
          threshold: 0,
        },
      );
      intersectionObserver.observe(end);
    } else {
      setShowScrollToBottom(false);
    }

    syncBottomState();

    return () => {
      container.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
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
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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

        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-6">
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
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
      <div
        ref={messagesContainerRef}
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-6 pb-20 sm:px-6"
      >
        <div className="w-full min-w-0 max-w-full space-y-4">
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

          {messages.map((message, messageIndex) => {
            const isLastMessage = messageIndex === messages.length - 1;
            const isAssistantLoading =
              isSending && isLastMessage && message.role === "assistant";
            const isUser = message.role === "user";

            return (
              <div
                key={message.id}
                className={`flex min-w-0 items-start gap-2.5 ${
                  isUser ? "justify-end" : "justify-start"
                }`}
              >
                {!isUser ? (
                  <img
                    src="/vite.svg"
                    alt=""
                    width={28}
                    height={28}
                    className="mt-0.5 box-border h-7 w-7 shrink-0 rounded-full border border-border bg-white object-contain shadow-sm"
                  />
                ) : null}
                <div
                  className={`min-w-0 break-words rounded-2xl px-4 py-3 text-[0.9375rem] leading-relaxed tracking-tight ${
                    isUser
                      ? "max-w-[min(100%,42rem)] bg-brand font-medium text-white"
                      : "max-w-full flex-1 bg-surface-muted text-foreground"
                  }`}
                >
                  <ChatMessageContent
                    message={message}
                    isLoading={isAssistantLoading}
                  />
                </div>
                {isUser ? (
                  userImageUrl ? (
                    <img
                      src={userImageUrl}
                      alt=""
                      width={28}
                      height={28}
                      className="mt-0.5 box-border h-7 w-7 shrink-0 rounded-full border border-border object-cover shadow-sm"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="mt-0.5 box-border flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-brand-soft text-xs font-semibold uppercase text-brand shadow-sm"
                    >
                      {userInitials}
                    </span>
                  )
                ) : null}
              </div>
            );
          })}
          {isSending && messages.at(-1)?.role === "user" ? (
            <div className="flex min-w-0 items-start gap-2.5 justify-start">
              <img
                src="/vite.svg"
                alt=""
                width={28}
                height={28}
                className="mt-0.5 box-border h-7 w-7 shrink-0 rounded-full border border-border bg-white object-contain shadow-sm"
              />
              <div className="min-w-0 flex-1 rounded-2xl bg-surface-muted px-4 py-3 text-[0.9375rem] leading-relaxed tracking-tight text-muted">
                Working on your request…
              </div>
            </div>
          ) : null}

          {chatErrorMessage ? (
            <div
              role="alert"
              className="flex min-w-0 items-start gap-2.5 justify-start"
            >
              <img
                src="/vite.svg"
                alt=""
                width={28}
                height={28}
                className="mt-0.5 box-border h-7 w-7 shrink-0 rounded-full border border-border bg-white object-contain shadow-sm"
              />
              <div className="min-w-0 flex-1 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.9375rem] leading-relaxed tracking-tight text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100">
                <p className="font-medium">Couldn’t generate a reply</p>
                <p className="mt-1 text-sm opacity-95">{chatErrorMessage}</p>
                <button
                  type="button"
                  onClick={() => clearError()}
                  className="mt-3 text-sm font-semibold text-red-900 underline-offset-2 hover:underline dark:text-red-50"
                >
                  Dismiss
                </button>
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
          onWheel={forwardWheelToMessages}
          aria-label="Scroll to bottom"
          className="absolute bottom-[4.25rem] left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border/80 bg-surface/90 text-foreground shadow-md backdrop-blur-sm transition hover:bg-surface"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      ) : null}

      <form
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3 pt-2 sm:px-4"
        onDragOver={handleComposerDragOver}
        onDragLeave={handleComposerDragLeave}
        onDrop={handleComposerDrop}
        onSubmit={(event) => {
          event.preventDefault();
          void sendCurrentMessage();
        }}
      >
        <div
          onWheel={forwardWheelToMessages}
          className={`pointer-events-auto mx-auto w-full min-w-0 max-w-3xl border bg-surface-muted/90 shadow-[0_8px_30px_rgba(15,39,68,0.14)] backdrop-blur-md transition focus-within:ring-2 focus-within:ring-brand-ring dark:bg-surface-muted/95 dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)] ${
            hasAttachment ? "rounded-3xl" : "rounded-full"
          } ${
            isFileDragOver
              ? "border-brand-accent ring-2 ring-brand-ring/40"
              : "border-border/70"
          }`}
        >
          {hasAttachment ? (
            <div
              className={`flex items-start gap-3 border-b p-3 ${
                isUploadingReceipt
                  ? "border-brand-accent/40 bg-brand-soft/70"
                  : "border-border/70"
              }`}
              aria-busy={isUploadingReceipt}
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border">
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

          <div className="flex h-12 min-w-0 items-center gap-1 px-1.5">
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
              placeholder="Ask.."
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
